import * as core from '@actions/core';
import { uploadOtaUpdate, UploadOtaParams } from '../../src/ota/upload';
import { runCommand } from '../../src/utils/exec';

jest.mock('../../src/utils/exec');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;

describe('ota/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  describe('S3 upload', () => {
    const s3Params: UploadOtaParams = {
      distDir: '/project/dist',
      manifestPath: '/project/manifest.json',
      storage: {
        type: 's3',
        bucket: 'my-app-updates',
        region: 'us-east-1',
        prefix: 'v1/ios',
      },
    };

    it('syncs dist directory to S3 with correct path and region', async () => {
      await uploadOtaUpdate(s3Params);

      expect(mockRunCommand).toHaveBeenCalledWith('aws', [
        's3',
        'sync',
        '/project/dist',
        's3://my-app-updates/v1/ios/',
        '--region',
        'us-east-1',
      ]);
    });

    it('uploads manifest to S3 with correct path', async () => {
      await uploadOtaUpdate(s3Params);

      expect(mockRunCommand).toHaveBeenCalledWith('aws', [
        's3',
        'cp',
        '/project/manifest.json',
        's3://my-app-updates/v1/ios/manifest.json',
        '--region',
        'us-east-1',
      ]);
    });

    it('calls sync before cp (correct order)', async () => {
      const callOrder: string[] = [];
      mockRunCommand.mockImplementation(async (_cmd, args) => {
        if (args?.[1] === 'sync') callOrder.push('sync');
        if (args?.[1] === 'cp') callOrder.push('cp');
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await uploadOtaUpdate(s3Params);

      expect(callOrder).toEqual(['sync', 'cp']);
    });

    it('handles S3 upload without prefix', async () => {
      const noPrefix: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: {
          type: 's3',
          bucket: 'my-bucket',
          region: 'eu-west-1',
        },
      };

      await uploadOtaUpdate(noPrefix);

      expect(mockRunCommand).toHaveBeenCalledWith('aws', [
        's3',
        'sync',
        '/project/dist',
        's3://my-bucket/',
        '--region',
        'eu-west-1',
      ]);
    });

    it('handles S3 upload without region', async () => {
      const noRegion: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: {
          type: 's3',
          bucket: 'my-bucket',
        },
      };

      await uploadOtaUpdate(noRegion);

      expect(mockRunCommand).toHaveBeenCalledWith('aws', [
        's3',
        'sync',
        '/project/dist',
        's3://my-bucket/',
      ]);
    });

    it('throws when bucket is not provided for S3', async () => {
      const noBucket: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 's3' },
      };

      await expect(uploadOtaUpdate(noBucket)).rejects.toThrow(
        'S3 upload requires a bucket name',
      );
    });

    it('does not call runCommand when bucket validation fails', async () => {
      const noBucket: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 's3' },
      };

      await expect(uploadOtaUpdate(noBucket)).rejects.toThrow();

      expect(mockRunCommand).not.toHaveBeenCalled();
    });

    it('logs upload info messages', async () => {
      await uploadOtaUpdate(s3Params);

      expect(core.info).toHaveBeenCalledWith('Uploading OTA update via s3...');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('OTA update uploaded. Manifest:'),
      );
    });
  });

  describe('GCS upload', () => {
    const gcsParams: UploadOtaParams = {
      distDir: '/project/dist',
      manifestPath: '/project/manifest.json',
      storage: {
        type: 'gcs',
        bucket: 'my-gcs-bucket',
        prefix: 'updates/v2',
      },
    };

    it('rsyncs dist directory to GCS with correct path', async () => {
      await uploadOtaUpdate(gcsParams);

      expect(mockRunCommand).toHaveBeenCalledWith('gsutil', [
        '-m',
        'rsync',
        '-r',
        '/project/dist',
        'gs://my-gcs-bucket/updates/v2/',
      ]);
    });

    it('uploads manifest to GCS with correct path', async () => {
      await uploadOtaUpdate(gcsParams);

      expect(mockRunCommand).toHaveBeenCalledWith('gsutil', [
        'cp',
        '/project/manifest.json',
        'gs://my-gcs-bucket/updates/v2/manifest.json',
      ]);
    });

    it('calls rsync before cp (correct order)', async () => {
      const callOrder: string[] = [];
      mockRunCommand.mockImplementation(async (_cmd, args) => {
        if (args?.includes('rsync')) callOrder.push('rsync');
        if (args?.[0] === 'cp') callOrder.push('cp');
        return { exitCode: 0, stdout: '', stderr: '' };
      });

      await uploadOtaUpdate(gcsParams);

      expect(callOrder).toEqual(['rsync', 'cp']);
    });

    it('handles GCS upload without prefix', async () => {
      const noPrefix: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: {
          type: 'gcs',
          bucket: 'my-gcs-bucket',
        },
      };

      await uploadOtaUpdate(noPrefix);

      expect(mockRunCommand).toHaveBeenCalledWith('gsutil', [
        '-m',
        'rsync',
        '-r',
        '/project/dist',
        'gs://my-gcs-bucket/',
      ]);
    });

    it('throws when bucket is not provided for GCS', async () => {
      const noBucket: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 'gcs' },
      };

      await expect(uploadOtaUpdate(noBucket)).rejects.toThrow(
        'GCS upload requires a bucket name',
      );
    });

    it('does not call runCommand when bucket validation fails', async () => {
      const noBucket: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 'gcs' },
      };

      await expect(uploadOtaUpdate(noBucket)).rejects.toThrow();

      expect(mockRunCommand).not.toHaveBeenCalled();
    });

    it('logs upload info messages', async () => {
      await uploadOtaUpdate(gcsParams);

      expect(core.info).toHaveBeenCalledWith('Uploading OTA update via gcs...');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('OTA update uploaded. Manifest:'),
      );
    });
  });

  describe('Custom upload', () => {
    const customParams: UploadOtaParams = {
      distDir: '/project/dist',
      manifestPath: '/project/manifest.json',
      storage: {
        type: 'custom',
        uploadCommand: 'rsync -avz $DIST_DIR user@host:/uploads/',
      },
    };

    it('runs the custom upload command via sh -c', async () => {
      await uploadOtaUpdate(customParams);

      expect(mockRunCommand).toHaveBeenCalledWith(
        'sh',
        ['-c', 'rsync -avz $DIST_DIR user@host:/uploads/'],
        expect.objectContaining({
          env: expect.objectContaining({
            DIST_DIR: '/project/dist',
            MANIFEST_PATH: '/project/manifest.json',
          }),
        }),
      );
    });

    it('sets DIST_DIR and MANIFEST_PATH env vars', async () => {
      await uploadOtaUpdate(customParams);

      const callArgs = mockRunCommand.mock.calls[0];
      const options = callArgs[2] as { env: Record<string, string> };

      expect(options.env.DIST_DIR).toBe('/project/dist');
      expect(options.env.MANIFEST_PATH).toBe('/project/manifest.json');
    });

    it('preserves existing process.env in the custom command env', async () => {
      const originalPath = process.env.PATH;

      await uploadOtaUpdate(customParams);

      const callArgs = mockRunCommand.mock.calls[0];
      const options = callArgs[2] as { env: Record<string, string> };

      expect(options.env.PATH).toBe(originalPath);
    });

    it('throws when uploadCommand is not provided for custom', async () => {
      const noCommand: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 'custom' },
      };

      await expect(uploadOtaUpdate(noCommand)).rejects.toThrow(
        'Custom upload requires an uploadCommand',
      );
    });

    it('does not call runCommand when uploadCommand validation fails', async () => {
      const noCommand: UploadOtaParams = {
        distDir: '/project/dist',
        manifestPath: '/project/manifest.json',
        storage: { type: 'custom' },
      };

      await expect(uploadOtaUpdate(noCommand)).rejects.toThrow();

      expect(mockRunCommand).not.toHaveBeenCalled();
    });

    it('logs upload info messages', async () => {
      await uploadOtaUpdate(customParams);

      expect(core.info).toHaveBeenCalledWith('Uploading OTA update via custom...');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('OTA update uploaded'),
      );
    });
  });

  describe('error handling', () => {
    it('propagates errors from runCommand during S3 sync', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: aws s3 sync (exit code 1)'),
      );

      await expect(
        uploadOtaUpdate({
          distDir: '/project/dist',
          manifestPath: '/project/manifest.json',
          storage: { type: 's3', bucket: 'my-bucket', region: 'us-east-1' },
        }),
      ).rejects.toThrow('Command failed: aws s3 sync');
    });

    it('propagates errors from runCommand during GCS rsync', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: gsutil (exit code 1)'),
      );

      await expect(
        uploadOtaUpdate({
          distDir: '/project/dist',
          manifestPath: '/project/manifest.json',
          storage: { type: 'gcs', bucket: 'my-bucket' },
        }),
      ).rejects.toThrow('Command failed: gsutil');
    });

    it('propagates errors from custom upload command', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: sh (exit code 127)'),
      );

      await expect(
        uploadOtaUpdate({
          distDir: '/project/dist',
          manifestPath: '/project/manifest.json',
          storage: { type: 'custom', uploadCommand: 'bad-command' },
        }),
      ).rejects.toThrow('Command failed: sh');
    });
  });
});
