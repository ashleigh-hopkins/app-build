import * as fs from 'fs';
import * as core from '@actions/core';
import { installAscApiKey } from '../../src/credentials/asc-api-key';
import { decodeBase64ToFile, maskSecret } from '../../src/utils/secrets';
import { registerCleanupFile } from '../../src/utils/cleanup';

jest.mock('../../src/utils/secrets', () => ({
  decodeBase64ToFile: jest.fn().mockResolvedValue('/tmp/app-build-asc-key.p8'),
  maskSecret: jest.fn(),
}));

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

const mockWriteFile = jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined);

const validCredentials = {
  keyId: 'ABC123DEF4',
  issuerId: '12345678-abcd-efgh-ijkl-123456789012',
  keyP8: Buffer.from('fake-p8-key-content').toString('base64'),
};

const KEY_P8_PATH = '/tmp/app-build-asc-key.p8';
const KEY_JSON_PATH = '/tmp/app-build-asc-api-key.json';

describe('credentials/asc-api-key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWriteFile.mockResolvedValue(undefined);
  });

  afterAll(() => {
    mockWriteFile.mockRestore();
  });

  describe('installAscApiKey', () => {
    it('decodes the .p8 key to temp file', async () => {
      await installAscApiKey(validCredentials);

      expect(decodeBase64ToFile).toHaveBeenCalledWith(
        validCredentials.keyP8,
        KEY_P8_PATH,
      );
    });

    it('creates the API key JSON file with correct structure', async () => {
      await installAscApiKey(validCredentials);

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const [filePath, content, encoding] = mockWriteFile.mock.calls[0];

      expect(filePath).toBe(KEY_JSON_PATH);
      expect(encoding).toBe('utf-8');

      const parsed = JSON.parse(content as string);
      expect(parsed).toEqual({
        key_id: validCredentials.keyId,
        issuer_id: validCredentials.issuerId,
        key: KEY_P8_PATH,
        in_house: false,
      });
    });

    it('writes JSON with pretty formatting (2-space indent)', async () => {
      await installAscApiKey(validCredentials);

      const content = mockWriteFile.mock.calls[0][1] as string;
      const expected = JSON.stringify(
        {
          key_id: validCredentials.keyId,
          issuer_id: validCredentials.issuerId,
          key: KEY_P8_PATH,
          in_house: false,
        },
        null,
        2,
      );

      expect(content).toBe(expected);
    });

    it('registers both the .p8 and JSON files for cleanup', async () => {
      await installAscApiKey(validCredentials);

      expect(registerCleanupFile).toHaveBeenCalledWith(KEY_P8_PATH);
      expect(registerCleanupFile).toHaveBeenCalledWith(KEY_JSON_PATH);
      expect(registerCleanupFile).toHaveBeenCalledTimes(2);
    });

    it('masks keyId, issuerId, and keyP8 content', async () => {
      await installAscApiKey(validCredentials);

      expect(maskSecret).toHaveBeenCalledWith(validCredentials.keyId);
      expect(maskSecret).toHaveBeenCalledWith(validCredentials.issuerId);
      expect(maskSecret).toHaveBeenCalledWith(validCredentials.keyP8);
      expect(maskSecret).toHaveBeenCalledTimes(3);
    });

    it('returns the correct paths for JSON and .p8 files', async () => {
      const result = await installAscApiKey(validCredentials);

      expect(result).toEqual({
        keyJsonPath: KEY_JSON_PATH,
        keyFilePath: KEY_P8_PATH,
      });
    });

    it('logs info message after successful installation', async () => {
      await installAscApiKey(validCredentials);

      expect(core.info).toHaveBeenCalledWith('App Store Connect API key installed');
    });

    it('sets in_house to false in the JSON output', async () => {
      await installAscApiKey(validCredentials);

      const content = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(content);

      expect(parsed.in_house).toBe(false);
    });

    it('sets the key path in JSON to the .p8 temp file path', async () => {
      await installAscApiKey(validCredentials);

      const content = mockWriteFile.mock.calls[0][1] as string;
      const parsed = JSON.parse(content);

      expect(parsed.key).toBe(KEY_P8_PATH);
    });
  });
});
