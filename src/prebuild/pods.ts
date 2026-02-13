import * as core from '@actions/core';
import * as path from 'path';
import { runCommand } from '../utils/exec';

export async function runPodInstall(projectDir: string): Promise<void> {
  core.info('Running pod install...');

  try {
    await runCommand('bundle', ['exec', 'pod', 'install'], {
      cwd: path.join(projectDir, 'ios'),
    });
  } catch (error) {
    core.warning(
      'pod install failed. You may need to run "pod repo update" to refresh the local CocoaPods spec repo.'
    );
    throw error;
  }

  core.info('pod install complete');
}
