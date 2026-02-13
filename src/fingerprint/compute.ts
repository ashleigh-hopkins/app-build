import * as core from '@actions/core';
import { runCommand } from '../utils/exec';

export interface FingerprintResult {
  hash: string;
  sourceCount: number;
}

/**
 * Compute the native fingerprint using @expo/fingerprint CLI.
 * The fingerprint captures everything that affects the native binary:
 * native source files, pods, gradle config, expo config, autolinking, etc.
 * JS-only changes do NOT change the fingerprint.
 */
export async function computeFingerprint(
  platform: 'ios' | 'android',
  projectDir: string,
): Promise<FingerprintResult> {
  core.info(`Computing native fingerprint for ${platform}...`);

  const { stdout } = await runCommand(
    'npx',
    ['@expo/fingerprint', 'fingerprint:generate', '--platform', platform],
    { cwd: projectDir },
  );

  let parsed: { hash: string; sources: unknown[] };
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error(
      'Failed to parse @expo/fingerprint output. ' +
        `Expected JSON with {hash, sources}. Got: ${stdout.slice(0, 200)}`,
    );
  }

  if (!parsed.hash || typeof parsed.hash !== 'string') {
    throw new Error(
      '@expo/fingerprint returned invalid result: missing or non-string hash field.',
    );
  }

  const result: FingerprintResult = {
    hash: parsed.hash,
    sourceCount: Array.isArray(parsed.sources) ? parsed.sources.length : 0,
  };

  core.info(`Native fingerprint: ${result.hash} (${result.sourceCount} sources)`);
  return result;
}
