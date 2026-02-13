import * as core from '@actions/core';
import { runCommand } from '../utils/exec';
import { generateFastfile, androidSubmitFastfile } from '../utils/fastfile';
import { decodeBase64ToFile, maskSecret } from '../utils/secrets';
import { registerCleanupFile } from '../utils/cleanup';

const SERVICE_ACCOUNT_PATH = '/tmp/app-build-play-service-account.json';

export interface GooglePlaySubmitParams {
  artifactPath: string;
  packageName: string;
  track: string;
  serviceAccountBase64: string;
  projectDir: string;
}

export async function submitToGooglePlay(
  params: GooglePlaySubmitParams,
): Promise<void> {
  const { artifactPath, packageName, track, serviceAccountBase64, projectDir } =
    params;

  if (!packageName) {
    throw new Error('Missing packageName for Google Play submission');
  }
  if (!serviceAccountBase64) {
    throw new Error(
      'Missing serviceAccountBase64 for Google Play submission',
    );
  }
  if (!artifactPath) {
    throw new Error('Missing artifactPath for Google Play submission');
  }

  await decodeBase64ToFile(serviceAccountBase64, SERVICE_ACCOUNT_PATH);
  maskSecret(serviceAccountBase64);
  registerCleanupFile(SERVICE_ACCOUNT_PATH);

  const content = androidSubmitFastfile({
    packageName,
    track,
    aabPath: artifactPath,
  });
  await generateFastfile(content, projectDir);

  process.env.GOOGLE_PLAY_JSON_KEY_PATH = SERVICE_ACCOUNT_PATH;

  try {
    await runCommand('bundle', ['exec', 'fastlane', 'android', 'submit'], {
      cwd: projectDir,
    });
    core.setOutput('submission-status', 'submitted');
    core.info('Google Play submission succeeded');
  } catch (error: unknown) {
    core.setOutput('submission-status', 'failed');

    const message =
      error instanceof Error ? error.message : String(error);

    if (
      message.includes('applicationNotFound') ||
      message.includes('403')
    ) {
      core.error(
        'Google Play API returned 403. If this is your first upload, it must be done manually via the Play Console.',
      );
      return;
    }

    throw error;
  }
}
