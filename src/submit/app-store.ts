import * as fs from 'fs';
import * as core from '@actions/core';
import { runCommand } from '../utils/exec';
import { generateFastfile, iosSubmitFastfile } from '../utils/fastfile';

export interface AppStoreSubmitParams {
  artifactPath: string;
  ascApiKeyId: string;
  ascApiIssuerId: string;
  ascApiKeyP8Path: string;
  projectDir: string;
}

export async function submitToAppStore(
  params: AppStoreSubmitParams
): Promise<void> {
  const { artifactPath, ascApiKeyId, ascApiIssuerId, ascApiKeyP8Path, projectDir } = params;

  if (!artifactPath) {
    throw new Error('Missing artifactPath for App Store submission');
  }
  if (!ascApiKeyP8Path) {
    throw new Error('Missing ascApiKeyP8Path for App Store submission');
  }

  try {
    fs.accessSync(artifactPath, fs.constants.R_OK);
  } catch {
    throw new Error(
      `Artifact not found or not readable: "${artifactPath}"`
    );
  }

  try {
    fs.accessSync(ascApiKeyP8Path, fs.constants.R_OK);
  } catch {
    throw new Error(
      `ASC API key file not found or not readable: "${ascApiKeyP8Path}"`
    );
  }

  const content = iosSubmitFastfile({ ipaPath: artifactPath });
  await generateFastfile(content, projectDir);

  // Set env vars that the Fastfile reads for app_store_connect_api_key
  process.env.ASC_API_KEY_ID = ascApiKeyId;
  process.env.ASC_API_ISSUER_ID = ascApiIssuerId;
  process.env.ASC_API_KEY_PATH = ascApiKeyP8Path;

  try {
    await runCommand('bundle', ['exec', 'fastlane', 'ios', 'submit'], {
      cwd: projectDir,
    });
    core.setOutput('submission-status', 'submitted');
    core.info('App Store submission succeeded');
  } catch (error: unknown) {
    core.setOutput('submission-status', 'failed');

    const message =
      error instanceof Error ? error.message : String(error);

    throw new Error(`App Store submission failed: ${message}`);
  }
}
