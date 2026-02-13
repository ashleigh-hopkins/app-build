import * as fs from 'fs';
import * as core from '@actions/core';
import { runCommand } from '../utils/exec';

const APPLICATIONS_DIR = '/Applications';
const XCODE_APP_PATTERN = /^Xcode_([\d.]+)\.app$/;

/**
 * List all Xcode versions installed in /Applications.
 * Returns entries like { version: '16.2', appPath: '/Applications/Xcode_16.2.app' }.
 */
export function listInstalledXcodeVersions(
  applicationsDir: string = APPLICATIONS_DIR,
): Array<{ version: string; appPath: string }> {
  let entries: string[];
  try {
    entries = fs.readdirSync(applicationsDir);
  } catch {
    return [];
  }

  const versions: Array<{ version: string; appPath: string }> = [];
  for (const entry of entries) {
    const match = entry.match(XCODE_APP_PATTERN);
    if (match) {
      versions.push({
        version: match[1],
        appPath: `${applicationsDir}/${entry}`,
      });
    }
  }

  // Sort by version descending (latest first) for fuzzy matching
  versions.sort((a, b) => compareVersions(b.version, a.version));

  return versions;
}

/**
 * Compare two dotted version strings numerically.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }

  return 0;
}

/**
 * Find the best matching Xcode version from installed versions.
 *
 * - Exact match: "16.2" matches "Xcode_16.2.app"
 * - Prefix/fuzzy match: "16" matches the latest "Xcode_16.X.app"
 *
 * Returns the matching entry, or null if no match is found.
 */
export function findBestXcodeMatch(
  requestedVersion: string,
  installed: Array<{ version: string; appPath: string }>,
): { version: string; appPath: string } | null {
  // Exact match first
  const exact = installed.find((v) => v.version === requestedVersion);
  if (exact) return exact;

  // Fuzzy/prefix match: requested version is a prefix of an installed version
  // e.g., "16" matches "16.2", "16.1", etc. — pick the latest (list is sorted descending)
  const prefix = requestedVersion + '.';
  const fuzzy = installed.find(
    (v) => v.version.startsWith(prefix) || v.version === requestedVersion,
  );
  if (fuzzy) return fuzzy;

  return null;
}

/**
 * Select the specified Xcode version on the runner.
 * If no version is specified, just log the current Xcode version.
 */
export async function selectXcodeVersion(
  xcodeVersion?: string,
  applicationsDir: string = APPLICATIONS_DIR,
): Promise<void> {
  if (!xcodeVersion) {
    // No version requested — just log the current version for informational purposes
    core.info('Step: Xcode version (using runner default)');
    const { stdout } = await runCommand('xcodebuild', ['-version']);
    const firstLine = stdout.trim().split('\n')[0];
    core.info(`Current Xcode: ${firstLine}`);
    return;
  }

  core.info(`Step: Xcode version selection (requested: ${xcodeVersion})`);

  const installed = listInstalledXcodeVersions(applicationsDir);
  if (installed.length === 0) {
    throw new Error(
      `No Xcode installations found in ${applicationsDir}. ` +
        'Ensure you are running on a macOS GitHub Actions runner with Xcode installed.',
    );
  }

  const match = findBestXcodeMatch(xcodeVersion, installed);
  if (!match) {
    const availableVersions = installed.map((v) => v.version).join(', ');
    throw new Error(
      `Xcode version "${xcodeVersion}" not found. ` +
        `Available versions: ${availableVersions}`,
    );
  }

  core.info(`Selecting Xcode ${match.version} at ${match.appPath}`);
  await runCommand('sudo', ['xcode-select', '-s', match.appPath]);

  // Verify the selection
  const { stdout } = await runCommand('xcodebuild', ['-version']);
  const firstLine = stdout.trim().split('\n')[0];
  core.info(`Active Xcode: ${firstLine}`);
}
