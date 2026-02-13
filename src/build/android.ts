import * as path from 'path';
import * as core from '@actions/core';
import type { AndroidBuildConfig } from '../config/schema';
import { runCommand } from '../utils/exec';
import { androidBuildFastfile, generateFastfile } from '../utils/fastfile';
import { findArtifact, uploadArtifact } from '../utils/artifacts';

export function getAndroidArtifactDir(
  projectDir: string,
  buildType: string,
  isAab: boolean
): string {
  const outputType = isAab ? 'bundle' : 'apk';
  return path.join(
    projectDir,
    'android',
    'app',
    'build',
    'outputs',
    outputType,
    buildType
  );
}

export async function buildAndroid(
  config: AndroidBuildConfig,
  projectDir: string
): Promise<string> {
  const isAab = config.aab !== false;
  const task = isAab ? 'bundle' : 'assemble';

  const fastfileContent = androidBuildFastfile({
    projectDir: path.join(projectDir, 'android'),
    task,
    buildType: config.buildType,
  });

  await generateFastfile(fastfileContent, projectDir);

  await runCommand('bundle', ['exec', 'fastlane', 'android', 'build'], {
    cwd: projectDir,
  });

  const artifactDir = getAndroidArtifactDir(
    projectDir,
    config.buildType,
    isAab
  );
  const pattern = isAab ? '*.aab' : '*.apk';
  const artifactPath = await findArtifact(pattern, artifactDir);

  await uploadArtifact('android-build', artifactPath);

  core.setOutput('artifact-path', artifactPath);

  return artifactPath;
}
