import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { exec } from '@actions/exec';
import {
  registerCleanupFile,
  registerCleanupKeychain,
  runCleanup,
} from '../../src/utils/cleanup';

const mockExec = exec as jest.MockedFunction<typeof exec>;

describe('utils/cleanup', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cleanup-test-'));
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('registerCleanupFile + runCleanup deletes registered files', async () => {
    const filePath = path.join(tmpDir, 'temp-cert.p12');
    await fs.promises.writeFile(filePath, 'fake-cert-data');

    registerCleanupFile(filePath);
    await runCleanup();

    await expect(fs.promises.access(filePath)).rejects.toThrow();
    expect(core.info).toHaveBeenCalledWith(`Removing file: ${filePath}`);
  });

  it('registerCleanupKeychain + runCleanup runs security delete-keychain', async () => {
    mockExec.mockResolvedValue(0);

    registerCleanupKeychain('app-build.keychain-db');
    await runCleanup();

    expect(mockExec).toHaveBeenCalledWith('security', [
      'delete-keychain',
      'app-build.keychain-db',
    ]);
    expect(core.info).toHaveBeenCalledWith(
      'Deleting keychain: app-build.keychain-db'
    );
  });

  it('runCleanup ignores errors when file does not exist', async () => {
    registerCleanupFile('/nonexistent/file.p12');

    // Should not throw
    await expect(runCleanup()).resolves.toBeUndefined();
  });

  it('runCleanup ignores errors when keychain delete fails', async () => {
    mockExec.mockRejectedValue(new Error('keychain not found'));

    registerCleanupKeychain('missing.keychain-db');

    // Should not throw
    await expect(runCleanup()).resolves.toBeUndefined();
  });

  it('handles multiple files and keychains', async () => {
    mockExec.mockResolvedValue(0);

    const file1 = path.join(tmpDir, 'a.p12');
    const file2 = path.join(tmpDir, 'b.mobileprovision');
    await fs.promises.writeFile(file1, 'data1');
    await fs.promises.writeFile(file2, 'data2');

    registerCleanupFile(file1);
    registerCleanupFile(file2);
    registerCleanupKeychain('kc1.keychain-db');
    registerCleanupKeychain('kc2.keychain-db');

    await runCleanup();

    // Both files should be deleted
    await expect(fs.promises.access(file1)).rejects.toThrow();
    await expect(fs.promises.access(file2)).rejects.toThrow();

    // Both keychains should have delete-keychain called
    expect(mockExec).toHaveBeenCalledWith('security', [
      'delete-keychain',
      'kc1.keychain-db',
    ]);
    expect(mockExec).toHaveBeenCalledWith('security', [
      'delete-keychain',
      'kc2.keychain-db',
    ]);
  });
});
