import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import {
  decodeBase64ToFile,
  maskSecret,
  maskFileContent,
} from '../../src/utils/secrets';
import { registerCleanupFile } from '../../src/utils/cleanup';

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

describe('utils/secrets', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'secrets-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('decodeBase64ToFile', () => {
    it('decodes base64 and writes content to a file', async () => {
      const originalContent = 'Hello, this is a certificate!';
      const base64 = Buffer.from(originalContent).toString('base64');
      const filePath = path.join(tmpDir, 'cert.p12');

      const result = await decodeBase64ToFile(base64, filePath);

      expect(result).toBe(filePath);
      const written = await fs.promises.readFile(filePath);
      expect(written.toString()).toBe(originalContent);
    });

    it('creates parent directories if they do not exist', async () => {
      const base64 = Buffer.from('test-data').toString('base64');
      const filePath = path.join(tmpDir, 'nested', 'deep', 'file.p12');

      await decodeBase64ToFile(base64, filePath);

      const written = await fs.promises.readFile(filePath);
      expect(written.toString()).toBe('test-data');
    });

    it('registers the file for cleanup', async () => {
      const base64 = Buffer.from('data').toString('base64');
      const filePath = path.join(tmpDir, 'registered.p12');

      await decodeBase64ToFile(base64, filePath);

      expect(registerCleanupFile).toHaveBeenCalledWith(filePath);
    });

    it('handles binary content correctly', async () => {
      // Create binary content (bytes 0x00 through 0xFF)
      const binaryData = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) {
        binaryData[i] = i;
      }
      const base64 = binaryData.toString('base64');
      const filePath = path.join(tmpDir, 'binary.keystore');

      await decodeBase64ToFile(base64, filePath);

      const written = await fs.promises.readFile(filePath);
      expect(Buffer.compare(written, binaryData)).toBe(0);
    });

    it('returns the file path as provided', async () => {
      const base64 = Buffer.from('x').toString('base64');
      const filePath = path.join(tmpDir, 'out.bin');

      const result = await decodeBase64ToFile(base64, filePath);

      expect(result).toBe(filePath);
    });
  });

  describe('maskSecret', () => {
    it('calls core.setSecret with the value', () => {
      maskSecret('super-secret-password');

      expect(core.setSecret).toHaveBeenCalledWith('super-secret-password');
    });

    it('masks empty strings without error', () => {
      maskSecret('');

      expect(core.setSecret).toHaveBeenCalledWith('');
    });
  });

  describe('maskFileContent', () => {
    it('reads file content and masks it via core.setSecret', async () => {
      const filePath = path.join(tmpDir, 'secret.txt');
      await fs.promises.writeFile(filePath, 'my-api-key-content');

      await maskFileContent(filePath);

      expect(core.setSecret).toHaveBeenCalledWith('my-api-key-content');
    });

    it('throws if the file does not exist', async () => {
      await expect(
        maskFileContent(path.join(tmpDir, 'nonexistent.txt'))
      ).rejects.toThrow();
    });
  });
});
