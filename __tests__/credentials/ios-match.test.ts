import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { installIosCredentialsViaMatch, IosMatchParams } from '../../src/credentials/ios-match';
import { runCommand } from '../../src/utils/exec';
import { decodeBase64ToFile, maskSecret } from '../../src/utils/secrets';
import { registerCleanupFile } from '../../src/utils/cleanup';
import { generateFastfile } from '../../src/utils/fastfile';

jest.mock('../../src/utils/exec', () => ({
  runCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

jest.mock('../../src/utils/secrets', () => ({
  decodeBase64ToFile: jest.fn().mockResolvedValue('/tmp/app-build-match-key'),
  maskSecret: jest.fn(),
}));

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

jest.mock('../../src/utils/fastfile', () => ({
  generateFastfile: jest.fn().mockResolvedValue('/project/fastlane/Fastfile'),
}));

const mockChmod = jest.spyOn(fs.promises, 'chmod').mockResolvedValue(undefined);

const baseParams: IosMatchParams = {
  type: 'appstore',
  storage: 'git',
  gitUrl: 'git@github.com:org/certs.git',
  matchPassword: 'match-secret-123',
};

describe('credentials/ios-match', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockChmod.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env = originalEnv;
    mockChmod.mockRestore();
  });

  describe('installIosCredentialsViaMatch', () => {
    it('sets MATCH_PASSWORD env var', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      expect(process.env.MATCH_PASSWORD).toBe(baseParams.matchPassword);
    });

    it('generates a Fastfile with match action including git_url for git storage', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      expect(generateFastfile).toHaveBeenCalledTimes(1);
      const fastfileContent = (generateFastfile as jest.Mock).mock.calls[0][0] as string;

      expect(fastfileContent).toContain('lane :match_install do');
      expect(fastfileContent).toContain(`type: "${baseParams.type}"`);
      expect(fastfileContent).toContain(`git_url: "${baseParams.gitUrl}"`);
      expect(fastfileContent).toContain(`storage_mode: "${baseParams.storage}"`);
      expect(fastfileContent).toContain('readonly: true');
      expect(fastfileContent).toContain('verbose: true');
    });

    it('writes Fastfile to the fastlane directory inside projectDir', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      const fastlaneDir = (generateFastfile as jest.Mock).mock.calls[0][1] as string;
      expect(fastlaneDir).toBe(path.join('/project', 'fastlane'));
    });

    it('does not include git_url when storage is not git', async () => {
      const s3Params: IosMatchParams = {
        ...baseParams,
        storage: 's3',
        gitUrl: undefined,
      };

      await installIosCredentialsViaMatch(s3Params, '/project');

      const fastfileContent = (generateFastfile as jest.Mock).mock.calls[0][0] as string;

      expect(fastfileContent).not.toContain('git_url');
      expect(fastfileContent).toContain('storage_mode: "s3"');
    });

    it('does not include git_url when storage is google_cloud', async () => {
      const gcParams: IosMatchParams = {
        ...baseParams,
        storage: 'google_cloud',
        gitUrl: undefined,
      };

      await installIosCredentialsViaMatch(gcParams, '/project');

      const fastfileContent = (generateFastfile as jest.Mock).mock.calls[0][0] as string;

      expect(fastfileContent).not.toContain('git_url');
      expect(fastfileContent).toContain('storage_mode: "google_cloud"');
    });

    it('runs bundle exec fastlane match_install', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      expect(runCommand).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'match_install'],
        { cwd: '/project' },
      );
    });

    it('masks the match password', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      expect(maskSecret).toHaveBeenCalledWith(baseParams.matchPassword);
    });

    it('logs info message after successful installation', async () => {
      await installIosCredentialsViaMatch(baseParams, '/project');

      expect(core.info).toHaveBeenCalledWith('iOS credentials installed via match');
    });

    describe('with SSH key', () => {
      const paramsWithKey: IosMatchParams = {
        ...baseParams,
        gitPrivateKey: Buffer.from('fake-ssh-key-content').toString('base64'),
      };

      it('decodes the SSH key to temp file', async () => {
        await installIosCredentialsViaMatch(paramsWithKey, '/project');

        expect(decodeBase64ToFile).toHaveBeenCalledWith(
          paramsWithKey.gitPrivateKey,
          '/tmp/app-build-match-key',
        );
      });

      it('sets SSH key permissions to 600', async () => {
        await installIosCredentialsViaMatch(paramsWithKey, '/project');

        expect(mockChmod).toHaveBeenCalledWith('/tmp/app-build-match-key', 0o600);
      });

      it('configures GIT_SSH_COMMAND env var', async () => {
        await installIosCredentialsViaMatch(paramsWithKey, '/project');

        expect(process.env.GIT_SSH_COMMAND).toBe(
          'ssh -i /tmp/app-build-match-key -o StrictHostKeyChecking=no',
        );
      });

      it('registers SSH key for cleanup', async () => {
        await installIosCredentialsViaMatch(paramsWithKey, '/project');

        expect(registerCleanupFile).toHaveBeenCalledWith('/tmp/app-build-match-key');
      });

      it('masks the SSH key', async () => {
        await installIosCredentialsViaMatch(paramsWithKey, '/project');

        expect(maskSecret).toHaveBeenCalledWith(paramsWithKey.gitPrivateKey);
      });
    });

    describe('without SSH key', () => {
      const paramsWithoutKey: IosMatchParams = {
        ...baseParams,
        gitPrivateKey: undefined,
      };

      it('does not decode an SSH key', async () => {
        await installIosCredentialsViaMatch(paramsWithoutKey, '/project');

        expect(decodeBase64ToFile).not.toHaveBeenCalled();
      });

      it('does not set GIT_SSH_COMMAND', async () => {
        delete process.env.GIT_SSH_COMMAND;
        await installIosCredentialsViaMatch(paramsWithoutKey, '/project');

        expect(process.env.GIT_SSH_COMMAND).toBeUndefined();
      });

      it('does not register SSH key for cleanup', async () => {
        await installIosCredentialsViaMatch(paramsWithoutKey, '/project');

        expect(registerCleanupFile).not.toHaveBeenCalled();
      });

      it('only masks the match password (not SSH key)', async () => {
        await installIosCredentialsViaMatch(paramsWithoutKey, '/project');

        expect(maskSecret).toHaveBeenCalledTimes(1);
        expect(maskSecret).toHaveBeenCalledWith(paramsWithoutKey.matchPassword);
      });
    });
  });
});
