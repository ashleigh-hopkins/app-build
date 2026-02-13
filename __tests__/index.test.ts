import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import { resolveWorkingDirectory } from '../src/index';

// Helper: create a temp directory with symlinks resolved (macOS /var -> /private/var)
function makeTempDir(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-wd-test-')));
}

describe('resolveWorkingDirectory', () => {
  let originalCwd: string;

  beforeEach(() => {
    jest.clearAllMocks();
    originalCwd = process.cwd();
  });

  afterEach(() => {
    // Always restore the original working directory
    process.chdir(originalCwd);
  });

  it('does nothing when workingDirectory is undefined', () => {
    resolveWorkingDirectory(undefined);

    expect(process.cwd()).toBe(originalCwd);
    expect(core.info).not.toHaveBeenCalled();
  });

  it('does nothing when workingDirectory is empty string', () => {
    resolveWorkingDirectory(undefined); // called with || undefined in run()

    expect(process.cwd()).toBe(originalCwd);
    expect(core.info).not.toHaveBeenCalled();
  });

  it('changes to an existing subdirectory', () => {
    const tmpDir = makeTempDir();
    const subDir = path.join(tmpDir, 'app');
    fs.mkdirSync(subDir);

    // Set cwd to tmpDir so the relative path 'app' resolves correctly
    process.chdir(tmpDir);

    resolveWorkingDirectory('app');

    expect(process.cwd()).toBe(subDir);
    expect(core.info).toHaveBeenCalledWith(`Working directory: ${subDir}`);

    // Cleanup: restore cwd before removing
    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('changes to an absolute directory path', () => {
    const tmpDir = makeTempDir();

    resolveWorkingDirectory(tmpDir);

    expect(process.cwd()).toBe(tmpDir);
    expect(core.info).toHaveBeenCalledWith(`Working directory: ${tmpDir}`);

    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('handles nested relative paths', () => {
    const tmpDir = makeTempDir();
    const nestedDir = path.join(tmpDir, 'packages', 'mobile');
    fs.mkdirSync(nestedDir, { recursive: true });

    process.chdir(tmpDir);

    resolveWorkingDirectory('packages/mobile');

    expect(process.cwd()).toBe(nestedDir);
    expect(core.info).toHaveBeenCalledWith(`Working directory: ${nestedDir}`);

    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('handles paths with trailing slash', () => {
    const tmpDir = makeTempDir();
    const subDir = path.join(tmpDir, 'app');
    fs.mkdirSync(subDir);

    process.chdir(tmpDir);

    resolveWorkingDirectory('app/');

    expect(process.cwd()).toBe(subDir);

    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('throws when the directory does not exist', () => {
    expect(() => resolveWorkingDirectory('/no/such/directory')).toThrow(
      /Working directory "\/no\/such\/directory" does not exist/,
    );
    // cwd should remain unchanged
    expect(process.cwd()).toBe(originalCwd);
  });

  it('throws when the path is a file, not a directory', () => {
    const tmpDir = makeTempDir();
    const filePath = path.join(tmpDir, 'not-a-dir.txt');
    fs.writeFileSync(filePath, 'hello');

    expect(() => resolveWorkingDirectory(filePath)).toThrow(
      /is not a directory/,
    );
    expect(process.cwd()).toBe(originalCwd);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('includes resolved path in error message for non-existent directory', () => {
    const tmpDir = makeTempDir();
    process.chdir(tmpDir);

    try {
      resolveWorkingDirectory('nonexistent-subdir');
      fail('Expected resolveWorkingDirectory to throw');
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain('nonexistent-subdir');
      expect(message).toContain(path.resolve(tmpDir, 'nonexistent-subdir'));
    }

    process.chdir(originalCwd);
    fs.rmSync(tmpDir, { recursive: true });
  });
});
