import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';

/**
 * Generate a Gemfile at the given project directory with the specified
 * Fastlane version.  When {@link fastlaneVersion} is `"latest"` the gem
 * is listed without a version constraint; otherwise a pessimistic pin
 * (`~>`) is used.
 *
 * @returns The absolute path to the generated Gemfile.
 */
export async function generateGemfile(
  fastlaneVersion: string,
  projectDir: string,
  platform?: string,
): Promise<string> {
  const gemLine =
    fastlaneVersion === 'latest'
      ? 'gem "fastlane"'
      : `gem "fastlane", "~> ${fastlaneVersion}"`;

  const gems = [gemLine];
  // iOS builds need cocoapods for `bundle exec pod install`
  if (platform === 'ios') {
    gems.push('gem "cocoapods"');
  }

  const content = `source "https://rubygems.org"\n\n${gems.join('\n')}\n`;

  const gemfilePath = path.join(projectDir, 'Gemfile');
  await fs.promises.writeFile(gemfilePath, content, 'utf8');

  core.info(`Generated Gemfile at ${gemfilePath}`);
  return gemfilePath;
}

/**
 * Check whether Fastlane is available (via Bundler) in the given
 * project directory.
 *
 * @returns `true` when `bundle exec fastlane --version` exits 0.
 */
export async function isFastlaneAvailable(
  projectDir: string
): Promise<boolean> {
  try {
    await runCommand('bundle', ['exec', 'fastlane', '--version'], {
      cwd: projectDir,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * High-level helper that ensures Ruby and Fastlane are ready to use:
 *
 * 1. Verify Ruby is installed.
 * 2. If no `Gemfile` exists in {@link projectDir}, generate one.
 * 3. Run `bundle install` with vendored gems for caching.
 * 4. Verify Fastlane works through Bundler.
 */
export async function setupRubyAndFastlane(
  fastlaneVersion: string,
  projectDir: string,
  platform?: string,
): Promise<void> {
  // 1. Verify Ruby is available
  await runCommand('ruby', ['--version']);

  // 1b. Ensure Bundler is available (some environments have Ruby but not Bundler)
  try {
    await runCommand('bundle', ['--version']);
  } catch {
    core.info('Bundler not found, installing...');
    try {
      await runCommand('gem', ['install', 'bundler', '--no-document']);
    } catch {
      // System gem directory may not be writable — try user install and add to PATH
      core.info('System gem install failed, trying --user-install...');
      await runCommand('gem', ['install', 'bundler', '--no-document', '--user-install']);
      // Add the user gem bin directory to PATH so `bundle` is found
      const { stdout: gemDir } = await runCommand('ruby', ['-e', 'puts Gem.user_dir']);
      const gemBinDir = path.join(gemDir.trim(), 'bin');
      core.addPath(gemBinDir);
      core.info(`Added ${gemBinDir} to PATH`);
    }
  }

  // 2. Check for existing Gemfile; generate one if missing
  const gemfilePath = path.join(projectDir, 'Gemfile');
  let gemfileExists: boolean;
  try {
    await fs.promises.access(gemfilePath);
    gemfileExists = true;
  } catch {
    gemfileExists = false;
  }

  if (!gemfileExists) {
    await generateGemfile(fastlaneVersion, projectDir, platform);
  }

  // 3. Install gems via Bundler (vendor path for caching)
  // Use `bundle config set path` (Bundler 2+) instead of deprecated `--path` flag (removed in Bundler 4)
  await runCommand('bundle', ['config', 'set', 'path', 'vendor/bundle'], {
    cwd: projectDir,
  });
  await runCommand('bundle', ['install'], {
    cwd: projectDir,
  });

  // 4. Verify Fastlane works
  await runCommand('bundle', ['exec', 'fastlane', '--version'], {
    cwd: projectDir,
  });
}
