import * as core from '@actions/core';
import * as fs from 'fs';
import { decodeBase64ToFile, maskSecret } from '../utils/secrets';
import { registerCleanupFile } from '../utils/cleanup';

const KEY_P8_PATH = '/tmp/app-build-asc-key.p8';
const KEY_JSON_PATH = '/tmp/app-build-asc-api-key.json';

export interface AscApiKeyResult {
  keyJsonPath: string;
  keyFilePath: string;
}

export async function installAscApiKey(credentials: {
  keyId: string;
  issuerId: string;
  keyP8: string;
}): Promise<AscApiKeyResult> {
  // 1. Decode .p8 key to temp file
  await decodeBase64ToFile(credentials.keyP8, KEY_P8_PATH);

  // 2. Create the API key JSON file
  const apiKeyJson = {
    key_id: credentials.keyId,
    issuer_id: credentials.issuerId,
    key: KEY_P8_PATH,
    in_house: false,
  };

  await fs.promises.writeFile(
    KEY_JSON_PATH,
    JSON.stringify(apiKeyJson, null, 2),
    'utf-8',
  );

  // 3. Register both files for cleanup
  registerCleanupFile(KEY_P8_PATH);
  registerCleanupFile(KEY_JSON_PATH);

  // 4. Mask sensitive values
  maskSecret(credentials.keyId);
  maskSecret(credentials.issuerId);
  maskSecret(credentials.keyP8);

  core.info('App Store Connect API key installed');

  // 5. Return paths
  return {
    keyJsonPath: KEY_JSON_PATH,
    keyFilePath: KEY_P8_PATH,
  };
}
