import * as fs from 'fs';
import * as core from '@actions/core';
import {
  submitToAppStore,
  AppStoreSubmitParams,
} from '../../src/submit/app-store';
import { runCommand } from '../../src/utils/exec';
import {
  generateFastfile,
  iosSubmitFastfile,
} from '../../src/utils/fastfile';

jest.mock('fs');
jest.mock('../../src/utils/exec', () => ({
  runCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

jest.mock('../../src/utils/fastfile', () => ({
  iosSubmitFastfile: jest.fn().mockReturnValue('fake-fastfile-content'),
  generateFastfile: jest.fn().mockResolvedValue('/tmp/Fastfile'),
}));

const mockAccessSync = fs.accessSync as jest.MockedFunction<typeof fs.accessSync>;

const validParams: AppStoreSubmitParams = {
  artifactPath: '/build/MyApp.ipa',
  ascApiKeyId: 'KEY123',
  ascApiIssuerId: 'ISSUER456',
  ascApiKeyP8Path: '/secrets/asc-key.p8',
  projectDir: '/workspace/project',
};

describe('submit/app-store', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // By default, files exist
    mockAccessSync.mockReturnValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('submitToAppStore', () => {
    it('validates that artifactPath exists on disk', async () => {
      await submitToAppStore(validParams);

      expect(mockAccessSync).toHaveBeenCalledWith(
        validParams.artifactPath,
        fs.constants.R_OK
      );
    });

    it('validates that ascApiKeyP8Path exists on disk', async () => {
      await submitToAppStore(validParams);

      expect(mockAccessSync).toHaveBeenCalledWith(
        validParams.ascApiKeyP8Path,
        fs.constants.R_OK
      );
    });

    it('throws when artifactPath does not exist', async () => {
      mockAccessSync.mockImplementation((p) => {
        if (p === validParams.artifactPath) {
          throw new Error('ENOENT');
        }
      });

      await expect(submitToAppStore(validParams)).rejects.toThrow(
        'Artifact not found or not readable'
      );
    });

    it('throws when ascApiKeyP8Path does not exist', async () => {
      mockAccessSync.mockImplementation((p) => {
        if (p === validParams.ascApiKeyP8Path) {
          throw new Error('ENOENT');
        }
      });

      await expect(submitToAppStore(validParams)).rejects.toThrow(
        'ASC API key file not found or not readable'
      );
    });

    it('generates the ios submit Fastfile with correct ipa path', async () => {
      await submitToAppStore(validParams);

      expect(iosSubmitFastfile).toHaveBeenCalledWith({
        ipaPath: '/build/MyApp.ipa',
      });
      expect(generateFastfile).toHaveBeenCalledWith(
        'fake-fastfile-content',
        '/workspace/project'
      );
    });

    it('sets ASC env vars before running fastlane', async () => {
      (runCommand as jest.Mock).mockImplementation(async () => {
        expect(process.env.ASC_API_KEY_ID).toBe('KEY123');
        expect(process.env.ASC_API_ISSUER_ID).toBe('ISSUER456');
        expect(process.env.ASC_API_KEY_PATH).toBe('/secrets/asc-key.p8');
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await submitToAppStore(validParams);

      expect(runCommand).toHaveBeenCalled();
    });

    it('runs bundle exec fastlane ios submit in projectDir', async () => {
      await submitToAppStore(validParams);

      expect(runCommand).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'ios', 'submit'],
        { cwd: '/workspace/project' }
      );
    });

    it('sets submission-status output to submitted on success', async () => {
      await submitToAppStore(validParams);

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'submitted'
      );
    });

    it('logs success message on successful submission', async () => {
      await submitToAppStore(validParams);

      expect(core.info).toHaveBeenCalledWith(
        'App Store submission succeeded'
      );
    });

    it('calls steps in the correct order', async () => {
      const callOrder: string[] = [];

      mockAccessSync.mockImplementation(() => {
        callOrder.push('accessSync');
      });
      (iosSubmitFastfile as jest.Mock).mockImplementation(() => {
        callOrder.push('iosSubmitFastfile');
        return 'fastfile-content';
      });
      (generateFastfile as jest.Mock).mockImplementation(async () => {
        callOrder.push('generateFastfile');
        return '/tmp/Fastfile';
      });
      (runCommand as jest.Mock).mockImplementation(async () => {
        callOrder.push('runCommand');
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await submitToAppStore(validParams);

      expect(callOrder).toEqual([
        'accessSync',    // artifactPath check
        'accessSync',    // ascApiKeyP8Path check
        'iosSubmitFastfile',
        'generateFastfile',
        'runCommand',
      ]);
    });
  });

  describe('validation errors', () => {
    it('throws when artifactPath is empty', async () => {
      const params = { ...validParams, artifactPath: '' };

      await expect(submitToAppStore(params)).rejects.toThrow(
        'Missing artifactPath for App Store submission'
      );
    });

    it('throws when ascApiKeyP8Path is empty', async () => {
      const params = { ...validParams, ascApiKeyP8Path: '' };

      await expect(submitToAppStore(params)).rejects.toThrow(
        'Missing ascApiKeyP8Path for App Store submission'
      );
    });

    it('does not call runCommand when validation fails', async () => {
      const params = { ...validParams, artifactPath: '' };

      await expect(submitToAppStore(params)).rejects.toThrow();

      expect(runCommand).not.toHaveBeenCalled();
    });

    it('does not call generateFastfile when file validation fails', async () => {
      mockAccessSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await expect(submitToAppStore(validParams)).rejects.toThrow();

      expect(generateFastfile).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('sets submission-status to failed when fastlane command fails', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error('Command failed: bundle exec fastlane (exit code 1)\nsome error')
      );

      await expect(submitToAppStore(validParams)).rejects.toThrow();

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed'
      );
    });

    it('rethrows with helpful message wrapping original error', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error('Command failed: bundle exec fastlane (exit code 1)\nBuild expired')
      );

      await expect(submitToAppStore(validParams)).rejects.toThrow(
        'App Store submission failed:'
      );
    });

    it('includes original error message in rethrown error', async () => {
      const originalMessage = 'Command failed: bundle exec fastlane (exit code 1)\nToken expired';
      (runCommand as jest.Mock).mockRejectedValue(
        new Error(originalMessage)
      );

      await expect(submitToAppStore(validParams)).rejects.toThrow(
        originalMessage
      );
    });

    it('handles non-Error thrown values', async () => {
      (runCommand as jest.Mock).mockRejectedValue('string error');

      await expect(submitToAppStore(validParams)).rejects.toThrow(
        'App Store submission failed: string error'
      );

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed'
      );
    });

    it('does not set submitted status when fastlane fails', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error('Command failed')
      );

      await expect(submitToAppStore(validParams)).rejects.toThrow();

      expect(core.setOutput).not.toHaveBeenCalledWith(
        'submission-status',
        'submitted'
      );
    });
  });
});
