import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';

export async function runExpoPrebuild(
  platform: 'ios' | 'android',
  projectDir: string,
  options?: { clean?: boolean }
): Promise<void> {
  core.info(`Running expo prebuild for ${platform}...`);

  const args = ['expo', 'prebuild', '--platform', platform, '--no-install'];
  if (options?.clean) {
    args.push('--clean');
  }

  await runCommand(
    'npx',
    args,
    { cwd: projectDir }
  );

  const nativeDir = path.join(projectDir, platform);
  if (!fs.existsSync(nativeDir)) {
    throw new Error(
      `expo prebuild did not generate the ${platform} directory. Check your app.json configuration.`
    );
  }

  core.info(`expo prebuild complete for ${platform}`);
}

export async function verifyNativeProject(
  platform: 'ios' | 'android',
  projectDir: string
): Promise<void> {
  if (platform === 'android') {
    const gradlePath = path.join(projectDir, 'android', 'app', 'build.gradle');
    const gradleKtsPath = path.join(
      projectDir,
      'android',
      'app',
      'build.gradle.kts'
    );

    if (!fs.existsSync(gradlePath) && !fs.existsSync(gradleKtsPath)) {
      throw new Error(
        'Android native project is missing android/app/build.gradle (or build.gradle.kts). ' +
          'Run expo prebuild first or check your project configuration.'
      );
    }
  } else {
    const iosDir = path.join(projectDir, 'ios');

    if (!fs.existsSync(iosDir)) {
      throw new Error(
        'iOS native project directory (ios/) does not exist. ' +
          'Run expo prebuild first or check your project configuration.'
      );
    }

    const entries = fs.readdirSync(iosDir);
    const hasWorkspace = entries.some((entry) =>
      entry.endsWith('.xcworkspace')
    );

    if (!hasWorkspace) {
      throw new Error(
        'iOS native project is missing an .xcworkspace file in the ios/ directory. ' +
          'Run expo prebuild first or check your project configuration.'
      );
    }
  }
}
