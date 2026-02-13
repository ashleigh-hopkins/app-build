import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { runCommand } from '../utils/exec';
import type { VersionStrategy } from '../config/schema';

/**
 * Resolves the Expo app config as a JSON object.
 *
 * Strategy:
 *   1. If `source` is provided, read that file directly (existing behaviour).
 *   2. Try to read `app.json` in `projectDir`.
 *   3. If `app.json` is missing or has no `expo` key, run
 *      `npx expo config --type public --json` to resolve dynamic configs
 *      (app.config.js / app.config.ts).
 *
 * Returns the parsed JSON and the path to the file that should be written
 * back (always app.json — Expo merges app.json with app.config.js).
 */
export async function resolveExpoConfig(
  projectDir: string,
  source?: string,
): Promise<{ config: Record<string, unknown>; writePath: string }> {
  // When an explicit source is provided, use it directly (original behaviour)
  if (source) {
    const filePath = path.resolve(projectDir, source);
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return { config: JSON.parse(raw), writePath: filePath };
  }

  const appJsonPath = path.resolve(projectDir, 'app.json');
  const writePath = appJsonPath; // always write to app.json

  // Try app.json first
  try {
    const raw = await fs.promises.readFile(appJsonPath, 'utf-8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    // If it has an expo key, it's a valid Expo config
    if (json.expo !== undefined) {
      return { config: json, writePath };
    }
    // app.json exists but no expo key — still return it (bare workflow)
    return { config: json, writePath };
  } catch {
    // app.json doesn't exist or isn't valid JSON — try dynamic config
  }

  // Check if app.config.js or app.config.ts exists
  const hasDynamicConfig =
    fs.existsSync(path.resolve(projectDir, 'app.config.js')) ||
    fs.existsSync(path.resolve(projectDir, 'app.config.ts'));

  if (hasDynamicConfig) {
    try {
      const { stdout } = await runCommand('npx', ['expo', 'config', '--type', 'public', '--json'], {
        cwd: projectDir,
      });
      const resolved = JSON.parse(stdout.trim()) as Record<string, unknown>;
      // Wrap in { expo: ... } to match the app.json structure that the rest
      // of the code expects.
      const config = { expo: resolved };

      // If app.json exists on disk, try to read it for write-back;
      // otherwise we'll create a fresh one.
      let existingJson: Record<string, unknown> = {};
      try {
        const raw = await fs.promises.readFile(appJsonPath, 'utf-8');
        existingJson = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Will create app.json from scratch
      }

      return { config: Object.keys(existingJson).length > 0 ? existingJson : config, writePath };
    } catch (err) {
      core.warning(`Failed to resolve dynamic Expo config: ${err}`);
      throw new Error(
        `No app.json found and could not resolve dynamic config in "${projectDir}". ` +
          'Ensure app.json, app.config.js, or app.config.ts exists.',
      );
    }
  }

  throw new Error(
    `No app config found in "${projectDir}". ` +
      'Expected app.json, app.config.js, or app.config.ts.',
  );
}

export interface BumpResult {
  previousValue: number;
  newValue: number;
  field: string; // e.g. "expo.ios.buildNumber" or "expo.android.versionCode"
  version?: string; // semantic version string (set by git-tag strategy)
}

/**
 * Bumps the version using the specified strategy.
 *
 * Strategies:
 *   - app-json (default): Read from app.json, increment by 1, write back.
 *   - git-tag: Parse the latest semver git tag, increment patch, use as version.
 *   - git-commit-count: Use `git rev-list --count HEAD` as the build number.
 *   - timestamp: Use YYYYMMDDHHmm as the build number.
 */
export async function bumpVersion(
  platform: 'ios' | 'android',
  projectDir: string,
  source?: string,
  strategy?: VersionStrategy,
  gitTagPattern?: string,
): Promise<BumpResult> {
  const effectiveStrategy = strategy ?? 'app-json';

  let result: BumpResult;

  switch (effectiveStrategy) {
    case 'app-json':
      result = await bumpFromAppJson(platform, projectDir, source);
      break;
    case 'git-tag':
      result = await bumpFromGitTag(platform, projectDir, source, gitTagPattern);
      break;
    case 'git-commit-count':
      result = await bumpFromGitCommitCount(platform, projectDir, source);
      break;
    case 'timestamp':
      result = await bumpFromTimestamp(platform, projectDir, source);
      break;
    default:
      throw new Error(`Unknown version strategy: ${effectiveStrategy}`);
  }

  // Always update native project files directly — necessary when skip-prebuild
  // is true (native dirs pre-committed, Expo prebuild doesn't run to apply config).
  // Also serves as a safety net for all strategies.
  if (platform === 'ios') {
    await updateNativeInfoPlist(projectDir, String(result.newValue), result.version);
  } else {
    await updateNativeBuildGradle(projectDir, result.newValue, result.version);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Strategy: app-json (original behaviour)
// ---------------------------------------------------------------------------

async function bumpFromAppJson(
  platform: 'ios' | 'android',
  projectDir: string,
  source?: string,
): Promise<BumpResult> {
  const { config: json, writePath } = await resolveExpoConfig(projectDir, source);

  const expo = (json.expo ?? {}) as Record<string, unknown>;

  let field: string;
  let previousRaw: unknown;

  if (platform === 'ios') {
    const iosObj = expo.ios as Record<string, unknown> | undefined;
    if (iosObj?.buildNumber !== undefined) {
      field = 'expo.ios.buildNumber';
      previousRaw = iosObj.buildNumber;
    } else if (expo.buildNumber !== undefined) {
      field = 'expo.buildNumber';
      previousRaw = expo.buildNumber;
    } else {
      field = 'expo.ios.buildNumber';
      previousRaw = undefined;
    }
  } else {
    const androidObj = expo.android as Record<string, unknown> | undefined;
    if (androidObj?.versionCode !== undefined) {
      field = 'expo.android.versionCode';
      previousRaw = androidObj.versionCode;
    } else if (expo.versionCode !== undefined) {
      field = 'expo.versionCode';
      previousRaw = expo.versionCode;
    } else {
      field = 'expo.android.versionCode';
      previousRaw = undefined;
    }
  }

  let previousValue: number;

  if (previousRaw === undefined) {
    previousValue = 0;
  } else {
    const parsed = Number(previousRaw);
    if (isNaN(parsed) || !isFinite(parsed)) {
      throw new Error(`${field} has non-numeric value "${previousRaw}"`);
    }
    previousValue = parsed;
  }

  const newValue = previousValue + 1;

  setNestedValue(json, field, platform === 'ios' ? String(newValue) : newValue);

  await fs.promises.writeFile(writePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');

  core.setOutput('build-number', newValue.toString());
  core.info(`Version bumped: ${field} ${previousValue} → ${newValue}`);

  return { previousValue, newValue, field };
}

// ---------------------------------------------------------------------------
// Strategy: git-tag
// ---------------------------------------------------------------------------

/**
 * Parses a semver-style version from a tag string.
 * Strips an optional leading "v" (or whatever matches before the first digit).
 * Returns {major, minor, patch} or null if parsing fails.
 */
export function parseVersionFromTag(tag: string): { major: number; minor: number; patch: number } | null {
  const match = tag.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

async function bumpFromGitTag(
  platform: 'ios' | 'android',
  projectDir: string,
  source?: string,
  gitTagPattern?: string,
): Promise<BumpResult> {
  const pattern = gitTagPattern ?? 'v*';

  let latestTag: string | null = null;
  try {
    const { stdout } = await runCommand('git', [
      'describe',
      '--tags',
      '--abbrev=0',
      `--match=${pattern}`,
    ], { cwd: projectDir });
    latestTag = stdout.trim();
  } catch {
    // No matching tags found — will use fallback
    core.info(`No git tags matching "${pattern}" found, using fallback version 1.0.0`);
  }

  let previousVersion = { major: 0, minor: 0, patch: 0 };
  if (latestTag) {
    const parsed = parseVersionFromTag(latestTag);
    if (parsed) {
      previousVersion = parsed;
    } else {
      core.warning(`Could not parse semver from tag "${latestTag}", using fallback 1.0.0`);
    }
  }

  // Increment patch
  const newVersion = {
    major: previousVersion.major || 1,
    minor: previousVersion.minor,
    patch: previousVersion.patch + (previousVersion.major === 0 ? 0 : 1),
  };

  // If there were no previous tags at all (0.0.0), start at 1.0.0
  if (previousVersion.major === 0 && previousVersion.minor === 0 && previousVersion.patch === 0) {
    newVersion.major = 1;
    newVersion.minor = 0;
    newVersion.patch = 0;
  }

  const versionString = `${newVersion.major}.${newVersion.minor}.${newVersion.patch}`;
  const buildNumber = newVersion.major * 10000 + newVersion.minor * 100 + newVersion.patch;

  const previousBuildNumber = previousVersion.major * 10000 + previousVersion.minor * 100 + previousVersion.patch;

  const field = platform === 'ios' ? 'expo.ios.buildNumber' : 'expo.android.versionCode';

  // Write back to app.json (or custom source)
  await writeVersionToAppJson(projectDir, source, field, platform === 'ios' ? String(buildNumber) : buildNumber, 'git-tag', (json) => {
    if (!json.expo) json.expo = {};
    (json.expo as Record<string, unknown>).version = versionString;
  });

  core.setOutput('build-number', buildNumber.toString());
  core.info(`Version bumped (git-tag): ${versionString} (build ${buildNumber})`);

  return { previousValue: previousBuildNumber, newValue: buildNumber, field, version: versionString };
}

// ---------------------------------------------------------------------------
// Strategy: git-commit-count
// ---------------------------------------------------------------------------

async function bumpFromGitCommitCount(
  platform: 'ios' | 'android',
  projectDir: string,
  source?: string,
): Promise<BumpResult> {
  const { stdout } = await runCommand('git', ['rev-list', '--count', 'HEAD'], { cwd: projectDir });
  const commitCount = parseInt(stdout.trim(), 10);

  if (isNaN(commitCount)) {
    throw new Error(`git rev-list --count HEAD returned non-numeric value: "${stdout.trim()}"`);
  }

  const field = platform === 'ios' ? 'expo.ios.buildNumber' : 'expo.android.versionCode';

  // Write back to app.json (or custom source)
  await writeVersionToAppJson(projectDir, source, field, platform === 'ios' ? String(commitCount) : commitCount, 'git-commit-count');

  core.setOutput('build-number', commitCount.toString());
  core.info(`Version bumped (git-commit-count): ${commitCount} commits`);

  // previousValue is 0 since we don't track previous commit counts
  return { previousValue: 0, newValue: commitCount, field };
}

// ---------------------------------------------------------------------------
// Strategy: timestamp
// ---------------------------------------------------------------------------

/**
 * Generates a YYYYMMDDHHmm timestamp number.
 * Exported for testing — can be overridden via dependency injection.
 */
export function generateTimestamp(date?: Date): number {
  const now = date ?? new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return parseInt(`${yyyy}${mm}${dd}${hh}${min}`, 10);
}

async function bumpFromTimestamp(
  platform: 'ios' | 'android',
  projectDir: string,
  source?: string,
): Promise<BumpResult> {
  const timestamp = generateTimestamp();

  const field = platform === 'ios' ? 'expo.ios.buildNumber' : 'expo.android.versionCode';

  // Write back to app.json (or custom source)
  await writeVersionToAppJson(projectDir, source, field, platform === 'ios' ? String(timestamp) : timestamp, 'timestamp');

  core.setOutput('build-number', timestamp.toString());
  core.info(`Version bumped (timestamp): ${timestamp}`);

  return { previousValue: 0, newValue: timestamp, field };
}

// ---------------------------------------------------------------------------
// Native project file updates
// ---------------------------------------------------------------------------

/**
 * Directly update iOS Info.plist CFBundleVersion and optionally CFBundleShortVersionString.
 * This is necessary when skip-prebuild is true, because Expo prebuild won't run to
 * apply app.json/app.config.js values to the native project.
 *
 * Uses plutil (available on macOS, where iOS builds always run).
 * Falls back gracefully on non-macOS (e.g. during tests).
 */
async function updateNativeInfoPlist(
  projectDir: string,
  buildNumber: string,
  version?: string,
): Promise<void> {
  const iosDir = path.join(projectDir, 'ios');
  if (!fs.existsSync(iosDir)) return;

  // Find all Info.plist files (excluding Pods/ and .derivedData/)
  const entries = fs.readdirSync(iosDir, { withFileTypes: true });
  const plistPaths: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'Pods' || entry.name.startsWith('.')) continue;

    const plistPath = path.join(iosDir, entry.name, 'Info.plist');
    if (fs.existsSync(plistPath)) {
      plistPaths.push(plistPath);
    }
  }

  for (const plistPath of plistPaths) {
    try {
      await runCommand('plutil', ['-replace', 'CFBundleVersion', '-string', buildNumber, plistPath], { cwd: projectDir });
      core.info(`Updated ${path.relative(projectDir, plistPath)}: CFBundleVersion=${buildNumber}`);

      if (version) {
        await runCommand('plutil', ['-replace', 'CFBundleShortVersionString', '-string', version, plistPath], { cwd: projectDir });
        core.info(`Updated ${path.relative(projectDir, plistPath)}: CFBundleShortVersionString=${version}`);
      }
    } catch (err) {
      core.info(`Could not update ${path.relative(projectDir, plistPath)}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

/**
 * Directly update Android versionCode in build.gradle.
 * Necessary when skip-prebuild is true.
 */
async function updateNativeBuildGradle(
  projectDir: string,
  versionCode: number,
  version?: string,
): Promise<void> {
  const buildGradlePath = path.join(projectDir, 'android', 'app', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) return;

  try {
    let content = await fs.promises.readFile(buildGradlePath, 'utf-8');

    // Replace versionCode in defaultConfig
    const vcReplaced = content.replace(
      /versionCode\s+\d+/,
      `versionCode ${versionCode}`,
    );
    if (vcReplaced !== content) {
      content = vcReplaced;
      core.info(`Updated android/app/build.gradle: versionCode=${versionCode}`);
    }

    // Optionally replace versionName
    if (version) {
      const vnReplaced = content.replace(
        /versionName\s+"[^"]*"/,
        `versionName "${version}"`,
      );
      if (vnReplaced !== content) {
        content = vnReplaced;
        core.info(`Updated android/app/build.gradle: versionName=${version}`);
      }
    }

    await fs.promises.writeFile(buildGradlePath, content, 'utf-8');
  } catch (err) {
    core.info(`Could not update android build.gradle: ${err instanceof Error ? err.message : err}`);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort write of a version field to app.json (or a custom source file).
 * Used by git-tag, git-commit-count, and timestamp strategies which derive the
 * version externally and only need to persist it in the config file.
 */
async function writeVersionToAppJson(
  projectDir: string,
  source: string | undefined,
  field: string,
  value: unknown,
  strategyName: string,
  extraMutations?: (json: Record<string, unknown>) => void,
): Promise<void> {
  const file = source ?? 'app.json';
  const filePath = path.resolve(projectDir, file);
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const json = JSON.parse(raw);
    setNestedValue(json, field, value);
    extraMutations?.(json);
    await fs.promises.writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
  } catch {
    core.info(`Could not update ${file} — file may not exist (${strategyName} strategy)`);
  }
}

/**
 * Sets a value at a dotted path (e.g. "expo.ios.buildNumber") in an object,
 * creating intermediate objects as needed.
 */
function setNestedValue(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const keys = dottedPath.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}
