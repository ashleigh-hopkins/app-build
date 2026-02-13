import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as glob from '@actions/glob';
import { restoreCaches, saveCaches, _resetRestoredKeys } from '../../src/setup/cache';

const mockRestoreCache = cache.restoreCache as jest.MockedFunction<typeof cache.restoreCache>;
const mockSaveCache = cache.saveCache as jest.MockedFunction<typeof cache.saveCache>;
const mockHashFiles = glob.hashFiles as jest.MockedFunction<typeof glob.hashFiles>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-cache-test-'));
}

function writeFile(dir: string, relativePath: string, content: string = 'stub'): void {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(Buffer.from(content)).digest('hex');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('setup/cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    _resetRestoredKeys();
    tmpDir = makeTempProject();
    mockRestoreCache.mockResolvedValue(undefined);
    mockSaveCache.mockResolvedValue(0);
    mockHashFiles.mockResolvedValue('');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // restoreCaches
  // -------------------------------------------------------------------------

  describe('restoreCaches', () => {
    it('restores node_modules cache using package-lock.json hash', async () => {
      writeFile(tmpDir, 'package-lock.json', 'lock-content');
      const expectedHash = sha256('lock-content');

      await restoreCaches('android', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'node_modules')],
        `node-android-${expectedHash}`,
      );
    });

    it('restores node_modules cache using yarn.lock when package-lock.json is absent', async () => {
      writeFile(tmpDir, 'yarn.lock', 'yarn-lock-content');
      const expectedHash = sha256('yarn-lock-content');

      await restoreCaches('ios', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'node_modules')],
        `node-ios-${expectedHash}`,
      );
    });

    it('prefers package-lock.json over yarn.lock when both exist', async () => {
      writeFile(tmpDir, 'package-lock.json', 'npm-content');
      writeFile(tmpDir, 'yarn.lock', 'yarn-content');
      const expectedHash = sha256('npm-content');

      await restoreCaches('android', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'node_modules')],
        `node-android-${expectedHash}`,
      );
    });

    it('restores Gradle cache for Android platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      mockHashFiles.mockResolvedValue('abc123gradlehash');

      await restoreCaches('android', tmpDir);

      expect(mockHashFiles).toHaveBeenCalledWith(
        path.join(tmpDir, 'android', 'build.gradle*'),
      );
      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(os.homedir(), '.gradle', 'caches')],
        'gradle-abc123gradlehash',
      );
    });

    it('does not attempt Gradle cache for iOS platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      mockHashFiles.mockResolvedValue('abc123gradlehash');

      await restoreCaches('ios', tmpDir);

      expect(mockHashFiles).not.toHaveBeenCalledWith(
        path.join(tmpDir, 'android', 'build.gradle*'),
      );
      // Verify no gradle key was used
      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('gradle-'))).toBe(true);
    });

    it('restores CocoaPods cache for iOS platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'ios/Podfile.lock', 'podfile-lock-content');
      const expectedHash = sha256('podfile-lock-content');

      await restoreCaches('ios', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'ios', 'Pods')],
        `pods-${expectedHash}`,
      );
    });

    it('does not attempt CocoaPods cache for Android platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'ios/Podfile.lock', 'podfile-lock-content');

      await restoreCaches('android', tmpDir);

      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('pods-'))).toBe(true);
    });

    it('restores Ruby gems cache with platform-specific key', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'Gemfile.lock', 'gemfile-lock-content');
      const expectedHash = sha256('gemfile-lock-content');

      await restoreCaches('android', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'vendor', 'bundle')],
        `gems-android-${expectedHash}`,
      );
    });

    it('restores Ruby gems cache for iOS with ios platform key', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'Gemfile.lock', 'gemfile-lock-content');
      const expectedHash = sha256('gemfile-lock-content');

      await restoreCaches('ios', tmpDir);

      expect(mockRestoreCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'vendor', 'bundle')],
        `gems-ios-${expectedHash}`,
      );
    });

    it('logs cache hit when restoreCache returns a key', async () => {
      writeFile(tmpDir, 'package-lock.json', 'content');
      const expectedHash = sha256('content');
      const expectedKey = `node-android-${expectedHash}`;
      mockRestoreCache.mockResolvedValue(expectedKey);

      await restoreCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        `Cache hit for node_modules: ${expectedKey}`,
      );
    });

    it('logs cache miss when restoreCache returns undefined', async () => {
      writeFile(tmpDir, 'package-lock.json', 'content');
      const expectedHash = sha256('content');
      const expectedKey = `node-android-${expectedHash}`;
      mockRestoreCache.mockResolvedValue(undefined);

      await restoreCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        `Cache miss for node_modules: ${expectedKey}`,
      );
    });

    it('skips node_modules cache when no lockfile exists', async () => {
      // No lockfile at all
      await restoreCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'No package-lock.json or yarn.lock found — skipping node_modules cache',
      );
      // No node cache restore should have been attempted
      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('node-'))).toBe(true);
    });

    it('skips Gradle cache when no build.gradle* files exist', async () => {
      writeFile(tmpDir, 'package-lock.json');
      mockHashFiles.mockResolvedValue('');

      await restoreCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'No android/build.gradle* files found — skipping Gradle cache',
      );
      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('gradle-'))).toBe(true);
    });

    it('skips CocoaPods cache when Podfile.lock is missing', async () => {
      writeFile(tmpDir, 'package-lock.json');

      await restoreCaches('ios', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'No ios/Podfile.lock found — skipping CocoaPods cache',
      );
      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('pods-'))).toBe(true);
    });

    it('skips Ruby gems cache when Gemfile.lock is missing', async () => {
      writeFile(tmpDir, 'package-lock.json');

      await restoreCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'No Gemfile.lock found — skipping Ruby gems cache',
      );
      const cacheKeys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(cacheKeys.every((key) => !key.startsWith('gems-'))).toBe(true);
    });

    it('restores all applicable caches for Android in parallel', async () => {
      writeFile(tmpDir, 'package-lock.json', 'npm-lock');
      writeFile(tmpDir, 'Gemfile.lock', 'gem-lock');
      mockHashFiles.mockResolvedValue('gradle-hash-value');

      await restoreCaches('android', tmpDir);

      // Should have exactly 3 calls: node_modules, Gradle, Ruby gems
      expect(mockRestoreCache).toHaveBeenCalledTimes(3);
      const keys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(keys.some((k) => k.startsWith('node-android-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('gradle-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('gems-android-'))).toBe(true);
    });

    it('restores all applicable caches for iOS in parallel', async () => {
      writeFile(tmpDir, 'package-lock.json', 'npm-lock');
      writeFile(tmpDir, 'ios/Podfile.lock', 'pod-lock');
      writeFile(tmpDir, 'Gemfile.lock', 'gem-lock');

      await restoreCaches('ios', tmpDir);

      // Should have 5 calls: node_modules, CocoaPods, ccache, DerivedData, Ruby gems
      expect(mockRestoreCache).toHaveBeenCalledTimes(5);
      const keys = mockRestoreCache.mock.calls.map((call) => call[1]);
      expect(keys.some((k) => k.startsWith('node-ios-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('pods-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('ccache-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('deriveddata-'))).toBe(true);
      expect(keys.some((k) => k.startsWith('gems-ios-'))).toBe(true);
    });

    it('handles restoreCache rejection gracefully without throwing', async () => {
      writeFile(tmpDir, 'package-lock.json', 'content');
      mockRestoreCache.mockRejectedValue(new Error('Network timeout'));

      // Should not throw
      await expect(restoreCaches('android', tmpDir)).resolves.toBeUndefined();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache restore warning'),
      );
    });
  });

  // -------------------------------------------------------------------------
  // saveCaches
  // -------------------------------------------------------------------------

  describe('saveCaches', () => {
    it('saves node_modules cache when it was not already restored', async () => {
      writeFile(tmpDir, 'package-lock.json', 'lock-content');
      // Create the node_modules directory so path exists check passes
      fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
      const expectedHash = sha256('lock-content');

      await saveCaches('android', tmpDir);

      expect(mockSaveCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'node_modules')],
        `node-android-${expectedHash}`,
      );
    });

    it('skips saving cache that was already restored (hit)', async () => {
      writeFile(tmpDir, 'package-lock.json', 'lock-content');
      const expectedHash = sha256('lock-content');
      const expectedKey = `node-android-${expectedHash}`;

      // Simulate a cache hit during restore
      mockRestoreCache.mockResolvedValue(expectedKey);
      await restoreCaches('android', tmpDir);

      jest.clearAllMocks();
      // Recreate lockfile since clearAllMocks doesn't affect fs
      fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });

      await saveCaches('android', tmpDir);

      // node_modules should NOT be saved since it was a hit
      const savedKeys = mockSaveCache.mock.calls.map((call) => call[1]);
      expect(savedKeys.every((key) => !key.startsWith('node-'))).toBe(true);
      expect(core.info).toHaveBeenCalledWith(
        `Cache already restored for node_modules — skipping save`,
      );
    });

    it('skips saving when the cache path does not exist on disk', async () => {
      writeFile(tmpDir, 'package-lock.json', 'lock-content');
      // Do NOT create node_modules directory

      await saveCaches('android', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'Path does not exist for node_modules — skipping save',
      );
      const savedKeys = mockSaveCache.mock.calls.map((call) => call[1]);
      expect(savedKeys.every((key) => !key.startsWith('node-'))).toBe(true);
    });

    it('saves Gradle cache for Android when path exists and no hit', async () => {
      writeFile(tmpDir, 'package-lock.json');
      mockHashFiles.mockResolvedValue('gradle-hash-123');
      // Create the Gradle caches directory
      const gradleDir = path.join(os.homedir(), '.gradle', 'caches');
      const gradleExisted = fs.existsSync(gradleDir);
      if (!gradleExisted) {
        fs.mkdirSync(gradleDir, { recursive: true });
      }

      await saveCaches('android', tmpDir);

      expect(mockSaveCache).toHaveBeenCalledWith(
        [gradleDir],
        'gradle-gradle-hash-123',
      );

      // Clean up if we created it
      if (!gradleExisted) {
        fs.rmSync(path.join(os.homedir(), '.gradle'), { recursive: true, force: true });
      }
    });

    it('saves CocoaPods cache for iOS when path exists and no hit', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'ios/Podfile.lock', 'podfile-content');
      const expectedHash = sha256('podfile-content');
      // Create the Pods directory
      fs.mkdirSync(path.join(tmpDir, 'ios', 'Pods'), { recursive: true });

      await saveCaches('ios', tmpDir);

      expect(mockSaveCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'ios', 'Pods')],
        `pods-${expectedHash}`,
      );
    });

    it('saves Ruby gems cache when path exists and no hit', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'Gemfile.lock', 'gem-content');
      const expectedHash = sha256('gem-content');
      fs.mkdirSync(path.join(tmpDir, 'vendor', 'bundle'), { recursive: true });

      await saveCaches('ios', tmpDir);

      expect(mockSaveCache).toHaveBeenCalledWith(
        [path.join(tmpDir, 'vendor', 'bundle')],
        `gems-ios-${expectedHash}`,
      );
    });

    it('does not save Gradle cache for iOS platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      mockHashFiles.mockResolvedValue('gradle-hash');

      await saveCaches('ios', tmpDir);

      const savedKeys = mockSaveCache.mock.calls.map((call) => call[1]);
      expect(savedKeys.every((key) => !key.startsWith('gradle-'))).toBe(true);
    });

    it('does not save CocoaPods cache for Android platform', async () => {
      writeFile(tmpDir, 'package-lock.json');
      writeFile(tmpDir, 'ios/Podfile.lock', 'content');
      fs.mkdirSync(path.join(tmpDir, 'ios', 'Pods'), { recursive: true });

      await saveCaches('android', tmpDir);

      const savedKeys = mockSaveCache.mock.calls.map((call) => call[1]);
      expect(savedKeys.every((key) => !key.startsWith('pods-'))).toBe(true);
    });

    it('handles saveCache rejection gracefully without throwing', async () => {
      writeFile(tmpDir, 'package-lock.json', 'content');
      fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
      mockSaveCache.mockRejectedValue(new Error('Save failed'));

      await expect(saveCaches('android', tmpDir)).resolves.toBeUndefined();

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Cache save warning'),
      );
    });

    it('only saves caches that were not hits among mixed results', async () => {
      writeFile(tmpDir, 'package-lock.json', 'npm-content');
      writeFile(tmpDir, 'Gemfile.lock', 'gem-content');
      const nodeHash = sha256('npm-content');
      const nodeKey = `node-android-${nodeHash}`;
      const gemHash = sha256('gem-content');

      // Simulate: node_modules was a hit, Ruby gems was a miss
      mockRestoreCache.mockImplementation(async (_paths, key) => {
        if (key === nodeKey) return nodeKey;
        return undefined;
      });

      await restoreCaches('android', tmpDir);

      jest.clearAllMocks();
      mockHashFiles.mockResolvedValue('');
      // Re-create the directories for save
      fs.mkdirSync(path.join(tmpDir, 'node_modules'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'vendor', 'bundle'), { recursive: true });

      await saveCaches('android', tmpDir);

      // Only gems should be saved, not node_modules
      const savedKeys = mockSaveCache.mock.calls.map((call) => call[1]);
      expect(savedKeys).not.toContain(nodeKey);
      expect(savedKeys).toContain(`gems-android-${gemHash}`);
    });
  });
});
