import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import {
  installAndroidKeystore,
  verifyKeystoreSigningConfig,
} from '../../src/credentials/android-keystore';
import { decodeBase64ToFile, maskSecret } from '../../src/utils/secrets';
import { registerCleanupFile } from '../../src/utils/cleanup';

jest.mock('../../src/utils/secrets', () => ({
  decodeBase64ToFile: jest.fn().mockResolvedValue('/tmp/app-build-upload.keystore'),
  maskSecret: jest.fn(),
}));

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

const validCredentials = {
  androidKeystore: Buffer.from('fake-keystore-binary').toString('base64'),
  androidKeystorePassword: 'store-pass-123',
  androidKeyAlias: 'my-key-alias',
  androidKeyPassword: 'key-pass-456',
};

describe('credentials/android-keystore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'android-keystore-test-'),
    );
    // Create android directory structure
    await fs.promises.mkdir(path.join(tmpDir, 'android'), { recursive: true });
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('installAndroidKeystore', () => {
    it('decodes keystore, writes gradle.properties, and registers cleanup', async () => {
      const result = await installAndroidKeystore(validCredentials, tmpDir);

      // Verify decodeBase64ToFile called with correct args
      expect(decodeBase64ToFile).toHaveBeenCalledWith(
        validCredentials.androidKeystore,
        '/tmp/app-build-upload.keystore',
      );

      // Verify cleanup registration
      expect(registerCleanupFile).toHaveBeenCalledWith(
        '/tmp/app-build-upload.keystore',
      );

      // Verify gradle.properties was written
      const gradleProps = await fs.promises.readFile(
        path.join(tmpDir, 'android', 'gradle.properties'),
        'utf-8',
      );
      expect(gradleProps).toContain(
        'MYAPP_UPLOAD_STORE_FILE=/tmp/app-build-upload.keystore',
      );
      expect(gradleProps).toContain(
        `MYAPP_UPLOAD_KEY_ALIAS=${validCredentials.androidKeyAlias}`,
      );
      expect(gradleProps).toContain(
        `MYAPP_UPLOAD_STORE_PASSWORD=${validCredentials.androidKeystorePassword}`,
      );
      expect(gradleProps).toContain(
        `MYAPP_UPLOAD_KEY_PASSWORD=${validCredentials.androidKeyPassword}`,
      );

      // Verify return value
      expect(result).toEqual({
        keystorePath: '/tmp/app-build-upload.keystore',
        keyAlias: validCredentials.androidKeyAlias,
      });
    });

    it('throws for missing androidKeystore', async () => {
      const creds = { ...validCredentials, androidKeystore: '' };

      await expect(installAndroidKeystore(creds, tmpDir)).rejects.toThrow(
        'Missing android-keystore input (base64-encoded .jks/.keystore file)',
      );
    });

    it('throws for missing androidKeystorePassword', async () => {
      const creds = { ...validCredentials, androidKeystorePassword: '' };

      await expect(installAndroidKeystore(creds, tmpDir)).rejects.toThrow(
        'Missing android-keystore-password input',
      );
    });

    it('throws for missing androidKeyAlias', async () => {
      const creds = { ...validCredentials, androidKeyAlias: '' };

      await expect(installAndroidKeystore(creds, tmpDir)).rejects.toThrow(
        'Missing android-key-alias input',
      );
    });

    it('throws for missing androidKeyPassword', async () => {
      const creds = { ...validCredentials, androidKeyPassword: '' };

      await expect(installAndroidKeystore(creds, tmpDir)).rejects.toThrow(
        'Missing android-key-password input',
      );
    });

    it('masks all secret values', async () => {
      await installAndroidKeystore(validCredentials, tmpDir);

      expect(maskSecret).toHaveBeenCalledWith(
        validCredentials.androidKeystorePassword,
      );
      expect(maskSecret).toHaveBeenCalledWith(
        validCredentials.androidKeyPassword,
      );
      expect(maskSecret).toHaveBeenCalledWith(
        validCredentials.androidKeystore,
      );
      expect(maskSecret).toHaveBeenCalledTimes(3);
    });

    it('preserves existing gradle.properties content (appends, does not overwrite)', async () => {
      const existingContent = 'org.gradle.jvmargs=-Xmx2048m\nandroid.useAndroidX=true\n';
      await fs.promises.writeFile(
        path.join(tmpDir, 'android', 'gradle.properties'),
        existingContent,
        'utf-8',
      );

      await installAndroidKeystore(validCredentials, tmpDir);

      const gradleProps = await fs.promises.readFile(
        path.join(tmpDir, 'android', 'gradle.properties'),
        'utf-8',
      );

      // Existing content must still be present
      expect(gradleProps).toContain('org.gradle.jvmargs=-Xmx2048m');
      expect(gradleProps).toContain('android.useAndroidX=true');

      // New signing config must also be present
      expect(gradleProps).toContain(
        'MYAPP_UPLOAD_STORE_FILE=/tmp/app-build-upload.keystore',
      );
      expect(gradleProps).toContain(
        `MYAPP_UPLOAD_KEY_ALIAS=${validCredentials.androidKeyAlias}`,
      );
    });

    it('appends with newline separator when existing content lacks trailing newline', async () => {
      const existingContent = 'org.gradle.jvmargs=-Xmx2048m';
      await fs.promises.writeFile(
        path.join(tmpDir, 'android', 'gradle.properties'),
        existingContent,
        'utf-8',
      );

      await installAndroidKeystore(validCredentials, tmpDir);

      const gradleProps = await fs.promises.readFile(
        path.join(tmpDir, 'android', 'gradle.properties'),
        'utf-8',
      );

      // The existing line should not be merged with the first signing line
      const lines = gradleProps.split('\n');
      expect(lines[0]).toBe('org.gradle.jvmargs=-Xmx2048m');
      expect(lines[1]).toBe('MYAPP_UPLOAD_STORE_FILE=/tmp/app-build-upload.keystore');
    });

    it('creates gradle.properties when it does not exist', async () => {
      // Remove any pre-existing file
      const gradlePath = path.join(tmpDir, 'android', 'gradle.properties');
      try {
        await fs.promises.unlink(gradlePath);
      } catch {
        // Doesn't exist, which is what we want
      }

      await installAndroidKeystore(validCredentials, tmpDir);

      const gradleProps = await fs.promises.readFile(gradlePath, 'utf-8');
      expect(gradleProps).toContain('MYAPP_UPLOAD_STORE_FILE');
    });

    it('creates the android directory if it does not exist', async () => {
      // Use a project dir with no android/ subdirectory
      const emptyProjectDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'android-keystore-empty-'),
      );

      try {
        await installAndroidKeystore(validCredentials, emptyProjectDir);

        const gradleProps = await fs.promises.readFile(
          path.join(emptyProjectDir, 'android', 'gradle.properties'),
          'utf-8',
        );
        expect(gradleProps).toContain('MYAPP_UPLOAD_STORE_FILE');
      } finally {
        await fs.promises.rm(emptyProjectDir, { recursive: true, force: true });
      }
    });

    it('logs info message after writing signing config', async () => {
      await installAndroidKeystore(validCredentials, tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        'Android keystore signing config written to gradle.properties',
      );
    });
  });

  describe('verifyKeystoreSigningConfig', () => {
    it('does not warn when signingConfigs block is present in build.gradle', async () => {
      const appDir = path.join(tmpDir, 'android', 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'build.gradle'),
        `
android {
    signingConfigs {
        release {
            storeFile file(MYAPP_UPLOAD_STORE_FILE)
        }
    }
}
`,
        'utf-8',
      );

      await verifyKeystoreSigningConfig(tmpDir);

      expect(core.warning).not.toHaveBeenCalled();
    });

    it('warns when signingConfigs block is missing from build.gradle', async () => {
      const appDir = path.join(tmpDir, 'android', 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'build.gradle'),
        `
android {
    defaultConfig {
        applicationId "com.example.app"
    }
}
`,
        'utf-8',
      );

      await verifyKeystoreSigningConfig(tmpDir);

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('No signingConfigs block found'),
      );
    });

    it('checks build.gradle.kts when build.gradle does not exist', async () => {
      const appDir = path.join(tmpDir, 'android', 'app');
      await fs.promises.mkdir(appDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(appDir, 'build.gradle.kts'),
        `
android {
    signingConfigs {
        create("release") {
            storeFile = file(MYAPP_UPLOAD_STORE_FILE)
        }
    }
}
`,
        'utf-8',
      );

      await verifyKeystoreSigningConfig(tmpDir);

      expect(core.warning).not.toHaveBeenCalled();
    });

    it('warns when neither build.gradle nor build.gradle.kts exists', async () => {
      await verifyKeystoreSigningConfig(tmpDir);

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Could not find android/app/build.gradle'),
      );
    });
  });
});
