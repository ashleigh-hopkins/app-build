import * as core from '@actions/core';
import { runCommand } from '../utils/exec';

export interface UploadStorageConfig {
  type: 's3' | 'gcs' | 'custom';
  bucket?: string;
  region?: string;
  prefix?: string;
  uploadCommand?: string;
}

export interface UploadOtaParams {
  distDir: string;
  manifestPath: string;
  storage: UploadStorageConfig;
}

async function uploadToS3(params: UploadOtaParams): Promise<string> {
  const { distDir, manifestPath, storage } = params;

  if (!storage.bucket) {
    throw new Error('S3 upload requires a bucket name in storage config');
  }

  const prefix = storage.prefix ? `${storage.prefix}/` : '';
  const s3Path = `s3://${storage.bucket}/${prefix}`;

  const syncArgs = ['s3', 'sync', distDir, s3Path];
  if (storage.region) {
    syncArgs.push('--region', storage.region);
  }
  await runCommand('aws', syncArgs);

  const manifestDest = `${s3Path}manifest.json`;
  const cpArgs = ['s3', 'cp', manifestPath, manifestDest];
  if (storage.region) {
    cpArgs.push('--region', storage.region);
  }
  await runCommand('aws', cpArgs);

  return manifestDest;
}

async function uploadToGcs(params: UploadOtaParams): Promise<string> {
  const { distDir, manifestPath, storage } = params;

  if (!storage.bucket) {
    throw new Error('GCS upload requires a bucket name in storage config');
  }

  const prefix = storage.prefix ? `${storage.prefix}/` : '';
  const gcsPath = `gs://${storage.bucket}/${prefix}`;

  await runCommand('gsutil', ['-m', 'rsync', '-r', distDir, gcsPath]);

  const manifestDest = `${gcsPath}manifest.json`;
  await runCommand('gsutil', ['cp', manifestPath, manifestDest]);

  return manifestDest;
}

async function uploadCustom(params: UploadOtaParams): Promise<string> {
  const { distDir, manifestPath, storage } = params;

  if (!storage.uploadCommand) {
    throw new Error(
      'Custom upload requires an uploadCommand in storage config',
    );
  }

  await runCommand('sh', ['-c', storage.uploadCommand], {
    env: {
      ...process.env,
      DIST_DIR: distDir,
      MANIFEST_PATH: manifestPath,
    },
  });

  return 'custom';
}

export async function uploadOtaUpdate(params: UploadOtaParams): Promise<void> {
  const { storage } = params;

  core.info(`Uploading OTA update via ${storage.type}...`);

  let manifestUrl: string;

  switch (storage.type) {
    case 's3':
      manifestUrl = await uploadToS3(params);
      break;
    case 'gcs':
      manifestUrl = await uploadToGcs(params);
      break;
    case 'custom':
      manifestUrl = await uploadCustom(params);
      break;
    default:
      throw new Error(`Unsupported storage type: ${storage.type as string}`);
  }

  core.info(`OTA update uploaded. Manifest: ${manifestUrl}`);
}
