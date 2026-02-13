import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import type { IosBuildConfig } from '../config/schema';
import type { InstalledProfile } from '../credentials/ios-keychain';
import { runCommand } from '../utils/exec';
import { iosBuildFastfile, generateFastfile } from '../utils/fastfile';
import { findArtifact, uploadArtifact } from '../utils/artifacts';

/**
 * Find the *.xcworkspace inside `<projectDir>/ios/`, excluding Pods.xcworkspace.
 * Throws with a helpful message if none is found.
 */
export function detectWorkspace(projectDir: string): string {
  const iosDir = path.join(projectDir, 'ios');

  let entries: string[];
  try {
    entries = fs.readdirSync(iosDir);
  } catch {
    throw new Error(
      `Could not read ios/ directory at "${iosDir}". ` +
        'Ensure the project has an ios/ folder (run prebuild if using Expo).'
    );
  }

  const workspaces = entries.filter(
    (e) => e.endsWith('.xcworkspace') && e !== 'Pods.xcworkspace'
  );

  if (workspaces.length === 0) {
    throw new Error(
      `No .xcworkspace found in "${iosDir}" (excluding Pods.xcworkspace). ` +
        'Make sure your Xcode workspace exists and the scheme is shared.'
    );
  }

  return path.join(iosDir, workspaces[0]);
}

/**
 * Configure Xcode project signing settings directly in the pbxproj.
 * Uses Ruby + xcodeproj gem (installed via CocoaPods) to set manual
 * signing with the correct identity and profile for each target.
 */
async function configureXcodeSigning(
  xcodeprojPath: string,
  teamId: string,
  profiles: Array<{ bundleId: string; profileName: string }>,
  projectDir: string,
): Promise<void> {
  const profileMap = JSON.stringify(
    Object.fromEntries(profiles.map((p) => [p.bundleId, p.profileName])),
  );

  const rubyScript = `
require 'xcodeproj'
require 'json'

project = Xcodeproj::Project.open('${xcodeprojPath}')
profile_map = JSON.parse('${profileMap.replace(/'/g, "\\'")}')

# Also fix project-level build configurations
project.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  config.build_settings['DEVELOPMENT_TEAM'] = '${teamId}'
  # Remove per-SDK identity overrides (expo prebuild sets "iPhone Distribution" etc.)
  config.build_settings.delete('CODE_SIGN_IDENTITY[sdk=iphoneos*]')
end

project.targets.each do |target|
  target.build_configurations.each do |config|
    bi = config.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
    next unless bi

    config.build_settings['CODE_SIGN_STYLE'] = 'Manual'
    config.build_settings['DEVELOPMENT_TEAM'] = '${teamId}'
    config.build_settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
    # Remove all per-SDK identity overrides
    keys_to_delete = config.build_settings.keys.select { |k| k.include?('CODE_SIGN_IDENTITY[') }
    keys_to_delete.each { |k| config.build_settings.delete(k) }

    if profile_map[bi]
      config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = profile_map[bi]
    end
  end
end

# Also fix any xcconfig files that may override CODE_SIGN_IDENTITY
ios_dir = File.dirname('${xcodeprojPath}')
Dir.glob(File.join(ios_dir, '**', '*.xcconfig')).each do |xcconfig_path|
  content = File.read(xcconfig_path)
  if content.include?('CODE_SIGN_IDENTITY')
    original = content.dup
    content.gsub!(/^CODE_SIGN_IDENTITY\\s*=.*$/, 'CODE_SIGN_IDENTITY = Apple Distribution')
    content.gsub!(/^CODE_SIGN_IDENTITY\\[sdk=iphoneos\\*\\]\\s*=.*$/, '')
    if content != original
      File.write(xcconfig_path, content)
      puts "  Fixed xcconfig: #{xcconfig_path}"
    end
  end
end

project.save
puts "Configured signing for #{project.targets.length} targets"
`;

  const scriptPath = path.join(projectDir, '.app-build-signing.rb');
  await fs.promises.writeFile(scriptPath, rubyScript, 'utf8');

  try {
    await runCommand('ruby', [scriptPath], { cwd: projectDir });
  } finally {
    await fs.promises.unlink(scriptPath).catch(() => {});
  }
}

/**
 * Set up ccache for faster recompilation of C/C++/ObjC files.
 * Uses PATH symlink approach — creates a directory with clang/clang++ symlinks
 * pointing to ccache, then prepends it to PATH. This avoids xcargs escaping issues.
 * Returns true if ccache was configured.
 */
async function setupCcache(projectDir: string): Promise<boolean> {
  try {
    await runCommand('which', ['ccache'], { cwd: projectDir });
  } catch {
    try {
      core.info('Installing ccache...');
      await runCommand('brew', ['install', 'ccache'], { cwd: projectDir });
    } catch {
      core.info('ccache not available — skipping compiler caching');
      return false;
    }
  }

  try {
    await runCommand('ccache', ['--set-config=max_size=2G'], { cwd: projectDir });
    // CRITICAL: Use content-based compiler check instead of mtime (default).
    // On CI, the compiler binary has a new mtime each runner provision.
    await runCommand('ccache', ['--set-config=compiler_check=content'], { cwd: projectDir });
    // CRITICAL: Normalize absolute paths — without this, /Users/runner/work/...
    // paths get hashed literally and any variation causes 100% cache misses.
    await runCommand('ccache', [`--set-config=base_dir=${projectDir}`], { cwd: projectDir });
    // Don't hash CWD into cache key — archive builds may use different intermediate paths.
    await runCommand('ccache', ['--set-config=hash_dir=false'], { cwd: projectDir });
    await runCommand('ccache', ['--set-config=sloppiness=clang_index_store,file_stat_matches,include_file_ctime,include_file_mtime,ivfsoverlay,pch_defines,time_macros,modules,system_headers'], { cwd: projectDir });
    // depend_mode=true is required for Clang modules (used extensively in iOS/RN).
    // Without it, ccache classifies most calls as "could_not_use_modules" → uncacheable.
    await runCommand('ccache', ['--set-config=depend_mode=true'], { cwd: projectDir });
    await runCommand('ccache', ['--set-config=file_clone=true'], { cwd: projectDir });
    await runCommand('ccache', ['-z'], { cwd: projectDir });

    // Point CC/CXX to ccache binary directly — xcodebuild needs a single executable path.
    // ccache detects the compiler from the symlink name or CCACHE_COMPILER env var.
    const ccachePath = (await runCommand('which', ['ccache'], { cwd: projectDir })).stdout.trim();

    // Create a wrapper directory with clang/clang++ symlinks to ccache
    const wrapperDir = path.join(projectDir, '.ccache-bin');
    fs.mkdirSync(wrapperDir, { recursive: true });

    const clangLink = path.join(wrapperDir, 'clang');
    const clangppLink = path.join(wrapperDir, 'clang++');
    try { fs.unlinkSync(clangLink); } catch {}
    try { fs.unlinkSync(clangppLink); } catch {}
    fs.symlinkSync(ccachePath, clangLink);
    fs.symlinkSync(ccachePath, clangppLink);

    // Set CC/CXX to the symlinks — xcodebuild needs a single path, not "ccache clang"
    process.env.CC = clangLink;
    process.env.CXX = clangppLink;
    process.env.CPLUSPLUS = clangppLink;

    core.info(`ccache configured (CC=${clangLink})`);
    return true;
  } catch (err) {
    core.info(`ccache setup failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

async function logCcacheStats(projectDir: string): Promise<void> {
  try {
    const result = await runCommand('ccache', ['-s'], { cwd: projectDir });
    core.info(`ccache stats:\n${result.stdout}`);
  } catch {
    // Ignore
  }
}

export async function buildIos(
  config: IosBuildConfig,
  projectDir: string,
  options?: {
    profiles?: InstalledProfile[];
    teamId?: string;
    xcodeprojPath?: string;
  },
): Promise<string> {
  const workspacePath = detectWorkspace(projectDir);

  const workspaceBasename = path.basename(workspacePath, '.xcworkspace');
  const scheme = config.scheme || workspaceBasename;
  const configuration = config.buildConfiguration || 'Release';
  const exportMethod = config.exportMethod || 'app-store';

  // Map InstalledProfile[] to the format expected by iosBuildFastfile
  const profilesForFastfile = options?.profiles?.map((p) => ({
    bundleId: p.bundleId,
    profileName: p.name,
  }));

  // Configure Xcode project signing directly in the pbxproj
  // This is more reliable than update_code_signing_settings since we
  // directly modify per-target build settings via xcodeproj gem
  if (options?.profiles && options.teamId && options.xcodeprojPath) {
    core.info('Configuring Xcode project signing settings...');
    await configureXcodeSigning(
      options.xcodeprojPath,
      options.teamId,
      profilesForFastfile || [],
      projectDir,
    );
  }

  // Set up ccache for faster compilation (uses PATH symlinks, no xcargs needed)
  await setupCcache(projectDir);
  const derivedDataPath = path.join(projectDir, '.derivedData');

  // xcargs optimizations:
  // - COMPILER_INDEX_STORE_ENABLE=NO: Skip index store (saves 5-10%)
  // - GCC_WARN_INHIBIT_ALL_WARNINGS=YES: Skip non-error warnings (minor speedup)
  const xcargs = 'COMPILER_INDEX_STORE_ENABLE=NO GCC_WARN_INHIBIT_ALL_WARNINGS=YES';

  const fastfileContent = iosBuildFastfile({
    workspace: workspacePath,
    scheme,
    configuration,
    exportMethod,
    outputDir: './build',
    outputName: `${scheme}.ipa`,
    profiles: profilesForFastfile,
    teamId: options?.teamId,
    xcodeprojPath: options?.xcodeprojPath,
    xcargs,
    derivedDataPath,
  });

  await generateFastfile(fastfileContent, projectDir);

  // Increase Fastlane's xcodebuild settings timeout (default 3s is too low on CI)
  process.env.FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT = '30';
  process.env.FASTLANE_XCODEBUILD_SETTINGS_RETRIES = '5';

  await runCommand('bundle', ['exec', 'fastlane', 'ios', 'build'], {
    cwd: projectDir,
  });

  // Log ccache stats
  await logCcacheStats(projectDir);

  const buildDir = path.join(projectDir, 'build');
  const artifactPath = await findArtifact('**/*.ipa', buildDir);

  await uploadArtifact('ios-build', artifactPath);

  core.setOutput('artifact-path', artifactPath);

  return artifactPath;
}
