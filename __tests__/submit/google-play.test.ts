import * as core from '@actions/core';
import {
  submitToGooglePlay,
  GooglePlaySubmitParams,
} from '../../src/submit/google-play';
import { runCommand } from '../../src/utils/exec';
import {
  generateFastfile,
  androidSubmitFastfile,
} from '../../src/utils/fastfile';
import { decodeBase64ToFile, maskSecret } from '../../src/utils/secrets';
import { registerCleanupFile } from '../../src/utils/cleanup';

jest.mock('../../src/utils/exec', () => ({
  runCommand: jest.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
}));

jest.mock('../../src/utils/fastfile', () => ({
  androidSubmitFastfile: jest.fn().mockReturnValue('fake-fastfile-content'),
  generateFastfile: jest.fn().mockResolvedValue('/tmp/Fastfile'),
}));

jest.mock('../../src/utils/secrets', () => ({
  decodeBase64ToFile: jest
    .fn()
    .mockResolvedValue('/tmp/app-build-play-service-account.json'),
  maskSecret: jest.fn(),
}));

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

const validParams: GooglePlaySubmitParams = {
  artifactPath: '/build/outputs/app-release.aab',
  packageName: 'com.example.myapp',
  track: 'internal',
  serviceAccountBase64: Buffer.from('{"type":"service_account"}').toString(
    'base64',
  ),
  projectDir: '/workspace/project',
};

describe('submit/google-play', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('submitToGooglePlay', () => {
    it('decodes service account JSON to temp file', async () => {
      await submitToGooglePlay(validParams);

      expect(decodeBase64ToFile).toHaveBeenCalledWith(
        validParams.serviceAccountBase64,
        '/tmp/app-build-play-service-account.json',
      );
    });

    it('masks the service account base64 value', async () => {
      await submitToGooglePlay(validParams);

      expect(maskSecret).toHaveBeenCalledWith(
        validParams.serviceAccountBase64,
      );
    });

    it('registers the service account temp file for cleanup', async () => {
      await submitToGooglePlay(validParams);

      expect(registerCleanupFile).toHaveBeenCalledWith(
        '/tmp/app-build-play-service-account.json',
      );
    });

    it('generates the android submit Fastfile with correct params', async () => {
      await submitToGooglePlay(validParams);

      expect(androidSubmitFastfile).toHaveBeenCalledWith({
        packageName: 'com.example.myapp',
        track: 'internal',
        aabPath: '/build/outputs/app-release.aab',
      });
      expect(generateFastfile).toHaveBeenCalledWith(
        'fake-fastfile-content',
        '/workspace/project',
      );
    });

    it('sets GOOGLE_PLAY_JSON_KEY_PATH env var before running fastlane', async () => {
      (runCommand as jest.Mock).mockImplementation(async () => {
        expect(process.env.GOOGLE_PLAY_JSON_KEY_PATH).toBe(
          '/tmp/app-build-play-service-account.json',
        );
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await submitToGooglePlay(validParams);

      expect(runCommand).toHaveBeenCalled();
    });

    it('runs bundle exec fastlane android submit in projectDir', async () => {
      await submitToGooglePlay(validParams);

      expect(runCommand).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'android', 'submit'],
        { cwd: '/workspace/project' },
      );
    });

    it('sets submission-status output to submitted on success', async () => {
      await submitToGooglePlay(validParams);

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'submitted',
      );
    });

    it('logs success message on successful submission', async () => {
      await submitToGooglePlay(validParams);

      expect(core.info).toHaveBeenCalledWith(
        'Google Play submission succeeded',
      );
    });

    it('calls steps in the correct order', async () => {
      const callOrder: string[] = [];

      (decodeBase64ToFile as jest.Mock).mockImplementation(async () => {
        callOrder.push('decodeBase64ToFile');
        return '/tmp/app-build-play-service-account.json';
      });
      (maskSecret as jest.Mock).mockImplementation(() => {
        callOrder.push('maskSecret');
      });
      (registerCleanupFile as jest.Mock).mockImplementation(() => {
        callOrder.push('registerCleanupFile');
      });
      (androidSubmitFastfile as jest.Mock).mockImplementation(() => {
        callOrder.push('androidSubmitFastfile');
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

      await submitToGooglePlay(validParams);

      expect(callOrder).toEqual([
        'decodeBase64ToFile',
        'maskSecret',
        'registerCleanupFile',
        'androidSubmitFastfile',
        'generateFastfile',
        'runCommand',
      ]);
    });
  });

  describe('validation errors', () => {
    it('throws when packageName is empty', async () => {
      const params = { ...validParams, packageName: '' };

      await expect(submitToGooglePlay(params)).rejects.toThrow(
        'Missing packageName for Google Play submission',
      );
    });

    it('throws when serviceAccountBase64 is empty', async () => {
      const params = { ...validParams, serviceAccountBase64: '' };

      await expect(submitToGooglePlay(params)).rejects.toThrow(
        'Missing serviceAccountBase64 for Google Play submission',
      );
    });

    it('throws when artifactPath is empty', async () => {
      const params = { ...validParams, artifactPath: '' };

      await expect(submitToGooglePlay(params)).rejects.toThrow(
        'Missing artifactPath for Google Play submission',
      );
    });

    it('does not call decodeBase64ToFile when validation fails', async () => {
      const params = { ...validParams, packageName: '' };

      await expect(submitToGooglePlay(params)).rejects.toThrow();

      expect(decodeBase64ToFile).not.toHaveBeenCalled();
    });

    it('does not call runCommand when validation fails', async () => {
      const params = { ...validParams, artifactPath: '' };

      await expect(submitToGooglePlay(params)).rejects.toThrow();

      expect(runCommand).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('sets submission-status to failed when fastlane command fails', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error('Command failed: bundle exec fastlane (exit code 1)\nsome error'),
      );

      await expect(submitToGooglePlay(validParams)).rejects.toThrow();

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed',
      );
    });

    it('logs specific error and does not rethrow for applicationNotFound', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error(
          'Command failed: bundle (exit code 1)\napplicationNotFound: No application found',
        ),
      );

      await submitToGooglePlay(validParams);

      expect(core.error).toHaveBeenCalledWith(
        'Google Play API returned 403. If this is your first upload, it must be done manually via the Play Console.',
      );
      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed',
      );
    });

    it('logs specific error and does not rethrow for 403', async () => {
      (runCommand as jest.Mock).mockRejectedValue(
        new Error(
          'Command failed: bundle (exit code 1)\n403 Forbidden',
        ),
      );

      await submitToGooglePlay(validParams);

      expect(core.error).toHaveBeenCalledWith(
        'Google Play API returned 403. If this is your first upload, it must be done manually via the Play Console.',
      );
      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed',
      );
    });

    it('rethrows unknown errors after setting failed status', async () => {
      const unknownError = new Error(
        'Command failed: bundle (exit code 1)\nUnexpected token in JSON',
      );
      (runCommand as jest.Mock).mockRejectedValue(unknownError);

      await expect(submitToGooglePlay(validParams)).rejects.toThrow(
        unknownError,
      );

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed',
      );
    });

    it('handles non-Error thrown values', async () => {
      (runCommand as jest.Mock).mockRejectedValue('string error');

      await expect(submitToGooglePlay(validParams)).rejects.toBe(
        'string error',
      );

      expect(core.setOutput).toHaveBeenCalledWith(
        'submission-status',
        'failed',
      );
    });

    it('handles non-Error thrown value containing 403', async () => {
      (runCommand as jest.Mock).mockRejectedValue('403 Forbidden');

      await submitToGooglePlay(validParams);

      expect(core.error).toHaveBeenCalledWith(
        'Google Play API returned 403. If this is your first upload, it must be done manually via the Play Console.',
      );
    });
  });
});
