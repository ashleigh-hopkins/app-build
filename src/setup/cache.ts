import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as glob from '@actions/glob';

// ---------------------------------------------------------------------------
// Track which cache keys were already restored (hit) so saveCaches can skip
// ---------------------------------------------------------------------------
const restoredKeys = new Set<string>();

/** Visible for testing — reset the internal restored-keys set. */
export function _resetRestoredKeys(): void {
  restoredKeys.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashFileContents(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function findNodeLockfile(projectDir: string): string | null {
  const packageLock = path.join(projectDir, 'package-lock.json');
  if (fs.existsSync(packageLock)) return packageLock;

  const yarnLock = path.join(projectDir, 'yarn.lock');
  if (fs.existsSync(yarnLock)) return yarnLock;

  return null;
}

// ---------------------------------------------------------------------------
// Cache descriptors
// ---------------------------------------------------------------------------

interface CacheDescriptor {
  name: string;
  key: string;
  paths: string[];
}

async function buildCacheDescriptors(
  platform: 'ios' | 'android',
  projectDir: string,
): Promise<CacheDescriptor[]> {
  const descriptors: CacheDescriptor[] = [];

  // 1. node_modules
  const lockfile = findNodeLockfile(projectDir);
  if (lockfile) {
    const hash = hashFileContents(lockfile);
    descriptors.push({
      name: 'node_modules',
      key: `node-${platform}-${hash}`,
      paths: [path.join(projectDir, 'node_modules')],
    });
  } else {
    core.info('No package-lock.json or yarn.lock found — skipping node_modules cache');
  }

  // 2. Gradle (Android only)
  if (platform === 'android') {
    const gradlePattern = path.join(projectDir, 'android', 'build.gradle*');
    const gradleHash = await glob.hashFiles(gradlePattern);
    if (gradleHash) {
      descriptors.push({
        name: 'Gradle',
        key: `gradle-${gradleHash}`,
        paths: [path.join(os.homedir(), '.gradle', 'caches')],
      });
    } else {
      core.info('No android/build.gradle* files found — skipping Gradle cache');
    }
  }

  // 3. CocoaPods (iOS only)
  if (platform === 'ios') {
    const podfileLock = path.join(projectDir, 'ios', 'Podfile.lock');
    if (fs.existsSync(podfileLock)) {
      const hash = hashFileContents(podfileLock);
      descriptors.push({
        name: 'CocoaPods',
        key: `pods-${hash}`,
        paths: [path.join(projectDir, 'ios', 'Pods')],
      });
    } else {
      core.info('No ios/Podfile.lock found — skipping CocoaPods cache');
    }
  }

  // 4. ccache (iOS only — compiler cache for C/C++/ObjC)
  // Key includes version suffix to bust stale caches when ccache config changes.
  // Increment CCACHE_KEY_VERSION when changing ccache settings (compiler_check, base_dir, etc.)
  if (platform === 'ios') {
    const CCACHE_KEY_VERSION = 'v2';
    const ccacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ccache');
    descriptors.push({
      name: 'ccache',
      key: `ccache-${platform}-${CCACHE_KEY_VERSION}`,
      paths: [ccacheDir],
    });
  }

  // 5. DerivedData (iOS only — Xcode incremental build cache)
  if (platform === 'ios') {
    const derivedDataDir = path.join(projectDir, '.derivedData');
    const podfileLockForDD = path.join(projectDir, 'ios', 'Podfile.lock');
    const ddHash = fs.existsSync(podfileLockForDD) ? hashFileContents(podfileLockForDD).slice(0, 12) : 'nopods';
    descriptors.push({
      name: 'DerivedData',
      key: `deriveddata-${ddHash}`,
      paths: [derivedDataDir],
    });
  }

  // 6. Ruby gems
  const gemfileLock = path.join(projectDir, 'Gemfile.lock');
  if (fs.existsSync(gemfileLock)) {
    const hash = hashFileContents(gemfileLock);
    descriptors.push({
      name: 'Ruby gems',
      key: `gems-${platform}-${hash}`,
      paths: [path.join(projectDir, 'vendor', 'bundle')],
    });
  } else {
    core.info('No Gemfile.lock found — skipping Ruby gems cache');
  }

  return descriptors;
}

// ---------------------------------------------------------------------------
// restoreCaches
// ---------------------------------------------------------------------------

export async function restoreCaches(
  platform: 'ios' | 'android',
  projectDir: string,
): Promise<void> {
  const descriptors = await buildCacheDescriptors(platform, projectDir);

  const results = await Promise.allSettled(
    descriptors.map(async (desc) => {
      const hit = await cache.restoreCache(desc.paths, desc.key);
      if (hit) {
        restoredKeys.add(desc.key);
        core.info(`Cache hit for ${desc.name}: ${desc.key}`);
      } else {
        core.info(`Cache miss for ${desc.name}: ${desc.key}`);
      }
    }),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      core.info(`Cache restore warning: ${result.reason}`);
    }
  }
}

// ---------------------------------------------------------------------------
// saveCaches
// ---------------------------------------------------------------------------

export async function saveCaches(
  platform: 'ios' | 'android',
  projectDir: string,
): Promise<void> {
  const descriptors = await buildCacheDescriptors(platform, projectDir);

  const results = await Promise.allSettled(
    descriptors.map(async (desc) => {
      if (restoredKeys.has(desc.key)) {
        core.info(`Cache already restored for ${desc.name} — skipping save`);
        return;
      }

      // Only save if the path actually exists on disk
      const pathExists = desc.paths.some((p) => fs.existsSync(p));
      if (!pathExists) {
        core.info(`Path does not exist for ${desc.name} — skipping save`);
        return;
      }

      await cache.saveCache(desc.paths, desc.key);
      core.info(`Cache saved for ${desc.name}: ${desc.key}`);
    }),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      core.info(`Cache save warning: ${result.reason}`);
    }
  }
}
