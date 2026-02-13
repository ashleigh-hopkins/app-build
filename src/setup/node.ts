import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';

// TODO: Use actions/setup-node composite action or @actions/tool-cache
// to install the specific Node.js version requested by the user.

export async function setupNode(nodeVersion: string): Promise<void> {
  core.info(`Setting up Node.js v${nodeVersion}`);

  const { stdout } = await runCommand('node', ['--version']);
  const currentVersion = stdout.trim();
  core.info(`Current Node.js version: ${currentVersion}`);

  // The action runner provides node20, but the project may need a different version.
  // Compare the major version to warn on mismatch.
  const currentMajor = currentVersion.replace(/^v/, '').split('.')[0];
  const requestedMajor = nodeVersion.split('.')[0];

  if (currentMajor !== requestedMajor) {
    core.warning(
      `Requested Node.js v${nodeVersion} but the current version is ${currentVersion}. ` +
        `Version switching is not yet implemented.`,
    );
  }
}

type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

interface LockfileEntry {
  file: string;
  pm: PackageManager;
}

const LOCKFILES: LockfileEntry[] = [
  { file: 'bun.lockb', pm: 'bun' },
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'package-lock.json', pm: 'npm' },
];

const INSTALL_COMMANDS: Record<PackageManager, { command: string; args: string[] }> = {
  bun: { command: 'bun', args: ['install'] },
  pnpm: { command: 'pnpm', args: ['install'] },
  yarn: { command: 'yarn', args: ['install', '--frozen-lockfile'] },
  npm: { command: 'npm', args: ['ci'] },
};

function detectPackageManager(projectDir: string): PackageManager | null {
  for (const { file, pm } of LOCKFILES) {
    if (fs.existsSync(path.join(projectDir, file))) {
      return pm;
    }
  }
  return null;
}

export async function installDependencies(projectDir: string): Promise<void> {
  const pm = detectPackageManager(projectDir);

  if (pm) {
    core.info(`Detected package manager: ${pm}`);
    const { command, args } = INSTALL_COMMANDS[pm];
    await runCommand(command, args, { cwd: projectDir });
  } else {
    core.warning('No lockfile found — falling back to npm install');
    await runCommand('npm', ['install'], { cwd: projectDir });
  }
}
