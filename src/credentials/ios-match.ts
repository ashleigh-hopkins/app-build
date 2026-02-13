import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';
import { decodeBase64ToFile, maskSecret } from '../utils/secrets';
import { registerCleanupFile } from '../utils/cleanup';
import { generateFastfile } from '../utils/fastfile';

const MATCH_SSH_KEY_PATH = '/tmp/app-build-match-key';

export interface IosMatchParams {
  type: string;
  storage: string;
  gitUrl?: string;
  matchPassword: string;
  gitPrivateKey?: string;
}

export async function installIosCredentialsViaMatch(
  params: IosMatchParams,
  projectDir: string,
): Promise<void> {
  // 1. If gitPrivateKey is provided, decode and configure SSH
  if (params.gitPrivateKey) {
    await decodeBase64ToFile(params.gitPrivateKey, MATCH_SSH_KEY_PATH);
    await fs.promises.chmod(MATCH_SSH_KEY_PATH, 0o600);
    process.env.GIT_SSH_COMMAND = `ssh -i ${MATCH_SSH_KEY_PATH} -o StrictHostKeyChecking=no`;
    registerCleanupFile(MATCH_SSH_KEY_PATH);
  }

  // 2. Set MATCH_PASSWORD env var
  process.env.MATCH_PASSWORD = params.matchPassword;

  // 3. Generate Fastfile with match action
  const matchOptions: string[] = [
    `    type: "${params.type}"`,
    `    storage_mode: "${params.storage}"`,
    '    readonly: true',
    '    verbose: true',
  ];

  if (params.storage === 'git' && params.gitUrl) {
    matchOptions.splice(1, 0, `    git_url: "${params.gitUrl}"`);
  }

  const fastfileContent = `default_platform(:ios)

platform :ios do
  lane :match_install do
    match(
${matchOptions.join(",\n")}
    )
  end
end
`;

  // 4. Write the Fastfile
  const fastlaneDir = path.join(projectDir, 'fastlane');
  await generateFastfile(fastfileContent, fastlaneDir);

  // 5. Run match
  await runCommand('bundle', ['exec', 'fastlane', 'match_install'], {
    cwd: projectDir,
  });

  // 6. Mask secrets
  maskSecret(params.matchPassword);
  if (params.gitPrivateKey) {
    maskSecret(params.gitPrivateKey);
  }

  core.info('iOS credentials installed via match');
}
