import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';

export async function runExpoExport(
  platform: 'ios' | 'android' | 'all',
  projectDir: string,
  outputDir?: string,
): Promise<string> {
  const resolvedOutputDir = outputDir ?? path.join(projectDir, 'dist');

  core.info(`Running expo export for ${platform}...`);

  const args = [
    'expo',
    'export',
    '--platform',
    platform,
    '--output-dir',
    resolvedOutputDir,
  ];

  await runCommand('npx', args, { cwd: projectDir });

  if (!fs.existsSync(resolvedOutputDir)) {
    throw new Error(
      `expo export did not generate the output directory at "${resolvedOutputDir}". Check your app.json configuration.`,
    );
  }

  const files = fs.readdirSync(resolvedOutputDir);
  if (files.length === 0) {
    throw new Error(
      `expo export output directory "${resolvedOutputDir}" is empty. Check your app.json configuration.`,
    );
  }

  core.info(
    `expo export complete: ${files.length} file(s) in ${resolvedOutputDir}`,
  );

  return resolvedOutputDir;
}
