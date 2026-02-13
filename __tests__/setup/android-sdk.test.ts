import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { detectAndroidSdk, setupAndroidSdk, writeLocalProperties } from '../../src/setup/android-sdk';

describe('setup/android-sdk', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'android-sdk-test-'));
    // Clear ANDROID env vars for clean test state
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
  });

  afterEach(async () => {
    // Restore original env
    process.env.ANDROID_HOME = originalEnv.ANDROID_HOME;
    process.env.ANDROID_SDK_ROOT = originalEnv.ANDROID_SDK_ROOT;
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('detectAndroidSdk', () => {
    it('returns ANDROID_HOME when set and exists', async () => {
      const sdkDir = path.join(tmpDir, 'fake-sdk');
      await fs.promises.mkdir(sdkDir);
      process.env.ANDROID_HOME = sdkDir;

      expect(detectAndroidSdk()).toBe(sdkDir);
    });

    it('returns ANDROID_SDK_ROOT when ANDROID_HOME not set', async () => {
      const sdkDir = path.join(tmpDir, 'fake-sdk');
      await fs.promises.mkdir(sdkDir);
      process.env.ANDROID_SDK_ROOT = sdkDir;

      expect(detectAndroidSdk()).toBe(sdkDir);
    });

    it('returns null when no env vars and no known paths exist', () => {
      expect(detectAndroidSdk()).toBeNull();
    });

    it('returns null when ANDROID_HOME points to non-existent path', () => {
      process.env.ANDROID_HOME = '/nonexistent/path';
      expect(detectAndroidSdk()).toBeNull();
    });
  });

  describe('setupAndroidSdk', () => {
    it('succeeds when ANDROID_HOME is already set and valid', async () => {
      const sdkDir = path.join(tmpDir, 'fake-sdk');
      await fs.promises.mkdir(sdkDir);
      process.env.ANDROID_HOME = sdkDir;

      await setupAndroidSdk();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('already set'));
    });

    it('detects SDK and exports ANDROID_HOME', async () => {
      const sdkDir = path.join(tmpDir, 'fake-sdk');
      await fs.promises.mkdir(sdkDir);
      // Simulate detection via ANDROID_SDK_ROOT (not ANDROID_HOME)
      process.env.ANDROID_SDK_ROOT = sdkDir;

      await setupAndroidSdk();

      expect(core.exportVariable).toHaveBeenCalledWith('ANDROID_HOME', sdkDir);
      expect(core.exportVariable).toHaveBeenCalledWith('ANDROID_SDK_ROOT', sdkDir);
    });

    it('adds platform-tools to PATH when it exists', async () => {
      const sdkDir = path.join(tmpDir, 'fake-sdk');
      const platformTools = path.join(sdkDir, 'platform-tools');
      await fs.promises.mkdir(platformTools, { recursive: true });
      process.env.ANDROID_SDK_ROOT = sdkDir;

      await setupAndroidSdk();

      expect(core.addPath).toHaveBeenCalledWith(platformTools);
    });

    it('throws when SDK not found', async () => {
      await expect(setupAndroidSdk()).rejects.toThrow('Android SDK not found');
      expect(core.error).toHaveBeenCalled();
    });
  });

  describe('writeLocalProperties', () => {
    it('writes sdk.dir to local.properties', async () => {
      const androidDir = path.join(tmpDir, 'android');
      await fs.promises.mkdir(androidDir);
      process.env.ANDROID_HOME = '/fake/sdk/path';

      await writeLocalProperties(tmpDir);

      const content = await fs.promises.readFile(
        path.join(androidDir, 'local.properties'),
        'utf8',
      );
      expect(content).toContain('sdk.dir=/fake/sdk/path');
    });

    it('skips when android/ directory does not exist', async () => {
      process.env.ANDROID_HOME = '/fake/sdk/path';
      await writeLocalProperties(tmpDir);

      const localPropsExists = fs.existsSync(path.join(tmpDir, 'android', 'local.properties'));
      expect(localPropsExists).toBe(false);
    });

    it('skips when ANDROID_HOME not set', async () => {
      const androidDir = path.join(tmpDir, 'android');
      await fs.promises.mkdir(androidDir);

      await writeLocalProperties(tmpDir);

      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('ANDROID_HOME not set'));
    });
  });
});
