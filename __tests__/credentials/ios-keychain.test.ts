import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { installIosCredentials } from '../../src/credentials/ios-keychain';
import { runCommand } from '../../src/utils/exec';
import { decodeBase64ToFile, maskSecret } from '../../src/utils/secrets';
import { registerCleanupFile, registerCleanupKeychain } from '../../src/utils/cleanup';

const MOCK_PROFILE_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>UUID</key>
  <string>ABCD1234-5678-90AB-CDEF-1234567890AB</string>
  <key>Name</key>
  <string>My App Distribution Profile</string>
  <key>TeamIdentifier</key>
  <array>
    <string>TEAM123456</string>
  </array>
  <key>Entitlements</key>
  <dict>
    <key>application-identifier</key>
    <string>TEAM123456.com.example.myapp</string>
  </dict>
</dict>
</plist>`;

jest.mock('../../src/utils/exec', () => ({
  runCommand: jest.fn().mockImplementation((cmd: string, args?: string[]) => {
    // Return mock plist XML for security cms -D -i calls
    if (cmd === 'security' && args && args[0] === 'cms') {
      return Promise.resolve({ exitCode: 0, stdout: MOCK_PROFILE_PLIST, stderr: '' });
    }
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
  }),
}));

jest.mock('../../src/utils/secrets', () => ({
  decodeBase64ToFile: jest.fn().mockResolvedValue('/tmp/mocked-path'),
  maskSecret: jest.fn(),
}));

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
  registerCleanupKeychain: jest.fn(),
}));

// Mock crypto.randomBytes to return deterministic value
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue({
    toString: jest.fn().mockReturnValue('abcdef1234567890abcdef1234567890abcdef1234567890'),
  }),
}));

// Mock fs.promises.mkdir and copyFile so no real filesystem ops happen in keychain tests
const mockMkdir = jest.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined);
const mockCopyFile = jest.spyOn(fs.promises, 'copyFile').mockResolvedValue(undefined);

const validCredentials = {
  certificateP12: Buffer.from('fake-p12-data').toString('base64'),
  certificatePassword: 'cert-pass-123',
  provisioningProfile: Buffer.from('fake-profile-data').toString('base64'),
};

const KEYCHAIN_NAME = 'app-build.keychain-db';
const KEYCHAIN_PASSWORD = 'abcdef1234567890abcdef1234567890abcdef1234567890';
const CERT_TEMP_PATH = '/tmp/app-build-cert.p12';
const PROFILE_TEMP_PATH = '/tmp/app-build-profile-main.mobileprovision';
const MOCK_UUID = 'ABCD1234-5678-90AB-CDEF-1234567890AB';

describe('credentials/ios-keychain', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockCopyFile.mockResolvedValue(undefined);
  });

  afterAll(() => {
    mockMkdir.mockRestore();
    mockCopyFile.mockRestore();
  });

  describe('installIosCredentials', () => {
    it('creates a temporary keychain with random password', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'create-keychain',
        '-p',
        KEYCHAIN_PASSWORD,
        KEYCHAIN_NAME,
      ]);
    });

    it('configures keychain timeout to 6 hours (21600s)', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'set-keychain-settings',
        '-lut',
        '21600',
        KEYCHAIN_NAME,
      ]);
    });

    it('sets the temp keychain as default', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'default-keychain',
        '-s',
        KEYCHAIN_NAME,
      ]);
    });

    it('unlocks the keychain', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'unlock-keychain',
        '-p',
        KEYCHAIN_PASSWORD,
        KEYCHAIN_NAME,
      ]);
    });

    it('adds temp keychain to search list preserving login keychain', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'list-keychains',
        '-d',
        'user',
        '-s',
        KEYCHAIN_NAME,
        'login.keychain-db',
      ]);
    });

    it('decodes the .p12 certificate to temp file', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(decodeBase64ToFile).toHaveBeenCalledWith(
        validCredentials.certificateP12,
        CERT_TEMP_PATH,
      );
    });

    it('imports the certificate into the keychain with codesign access', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'import',
        CERT_TEMP_PATH,
        '-k',
        KEYCHAIN_NAME,
        '-P',
        validCredentials.certificatePassword,
        '-T',
        '/usr/bin/codesign',
        '-T',
        '/usr/bin/security',
      ]);
    });

    it('sets the key partition list for codesigning', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(runCommand).toHaveBeenCalledWith('security', [
        'set-key-partition-list',
        '-S',
        'apple-tool:,apple:',
        '-s',
        '-k',
        KEYCHAIN_PASSWORD,
        KEYCHAIN_NAME,
      ]);
    });

    it('decodes the provisioning profile to temp file', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(decodeBase64ToFile).toHaveBeenCalledWith(
        validCredentials.provisioningProfile,
        '/tmp/app-build-profile-main.mobileprovision',
      );
    });

    it('creates the Provisioning Profiles directory and copies the profile with UUID filename', async () => {
      await installIosCredentials(validCredentials, '/project');

      const expectedProfilesDir = path.join(
        process.env.HOME || '~',
        'Library',
        'MobileDevice',
        'Provisioning Profiles',
      );
      const expectedInstallPath = path.join(
        expectedProfilesDir,
        `${MOCK_UUID}.mobileprovision`,
      );

      expect(mockMkdir).toHaveBeenCalledWith(expectedProfilesDir, { recursive: true });
      expect(mockCopyFile).toHaveBeenCalledWith(PROFILE_TEMP_PATH, expectedInstallPath);
    });

    it('registers keychain for cleanup', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(registerCleanupKeychain).toHaveBeenCalledWith(KEYCHAIN_NAME);
    });

    it('registers all temp files for cleanup', async () => {
      await installIosCredentials(validCredentials, '/project');

      const expectedInstallPath = path.join(
        process.env.HOME || '~',
        'Library',
        'MobileDevice',
        'Provisioning Profiles',
        `${MOCK_UUID}.mobileprovision`,
      );

      // installProfile registers the temp file and install path; main function registers cert
      expect(registerCleanupFile).toHaveBeenCalledWith(PROFILE_TEMP_PATH);
      expect(registerCleanupFile).toHaveBeenCalledWith(expectedInstallPath);
      expect(registerCleanupFile).toHaveBeenCalledWith(CERT_TEMP_PATH);
    });

    it('masks all secret values including the generated keychain password', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(maskSecret).toHaveBeenCalledWith(validCredentials.certificateP12);
      expect(maskSecret).toHaveBeenCalledWith(validCredentials.certificatePassword);
      expect(maskSecret).toHaveBeenCalledWith(validCredentials.provisioningProfile);
      expect(maskSecret).toHaveBeenCalledWith(KEYCHAIN_PASSWORD);
      // installProfile masks profile base64 once, then installIosCredentials masks cert, password, profile, keychain password
      expect(maskSecret).toHaveBeenCalledTimes(5);
    });

    it('returns keychainName, keychainPath, and profiles array', async () => {
      const result = await installIosCredentials(validCredentials, '/project');

      const expectedInstallPath = path.join(
        process.env.HOME || '~',
        'Library',
        'MobileDevice',
        'Provisioning Profiles',
        `${MOCK_UUID}.mobileprovision`,
      );

      expect(result).toEqual({
        keychainName: KEYCHAIN_NAME,
        keychainPath: KEYCHAIN_NAME,
        profiles: [
          {
            uuid: MOCK_UUID,
            name: 'My App Distribution Profile',
            bundleId: 'com.example.myapp',
            teamId: 'TEAM123456',
            filePath: expectedInstallPath,
          },
        ],
      });
    });

    it('logs info message after successful installation', async () => {
      await installIosCredentials(validCredentials, '/project');

      expect(core.info).toHaveBeenCalledWith(
        'iOS keychain and 1 provisioning profile(s) installed',
      );
    });

    it('executes security commands in the correct order', async () => {
      await installIosCredentials(validCredentials, '/project');

      const calls = (runCommand as jest.Mock).mock.calls;

      // Verify the ordering of security commands
      expect(calls[0][1][0]).toBe('create-keychain');
      expect(calls[1][1][0]).toBe('set-keychain-settings');
      expect(calls[2][1][0]).toBe('default-keychain');
      expect(calls[3][1][0]).toBe('unlock-keychain');
      expect(calls[4][1][0]).toBe('list-keychains');
      expect(calls[5][1][0]).toBe('import');
      expect(calls[6][1][0]).toBe('set-key-partition-list');
      // installProfile calls security cms to extract profile metadata
      expect(calls[7][0]).toBe('security');
      expect(calls[7][1][0]).toBe('cms');
    });
  });
});
