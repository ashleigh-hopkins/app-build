import * as fs from 'fs';
import * as core from '@actions/core';
import { runExpoExport } from '../../src/ota/export';
import { runCommand } from '../../src/utils/exec';

jest.mock('fs');
jest.mock('../../src/utils/exec');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReaddirSync = fs.readdirSync as unknown as jest.Mock<string[], [string]>;

describe('ota/export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runExpoExport', () => {
    it('runs npx expo export with correct args for ios', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['ios-abc123.js']);

      await runExpoExport('ios', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'export', '--platform', 'ios', '--output-dir', '/project/dist'],
        { cwd: '/project' },
      );
    });

    it('runs npx expo export with correct args for android', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['android-abc123.js']);

      await runExpoExport('android', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'export', '--platform', 'android', '--output-dir', '/project/dist'],
        { cwd: '/project' },
      );
    });

    it('runs npx expo export with correct args for all platforms', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['ios-abc.js', 'android-def.js']);

      await runExpoExport('all', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'export', '--platform', 'all', '--output-dir', '/project/dist'],
        { cwd: '/project' },
      );
    });

    it('uses custom outputDir when provided', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['ios-abc123.js']);

      const result = await runExpoExport('ios', '/project', '/custom/output');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'export', '--platform', 'ios', '--output-dir', '/custom/output'],
        { cwd: '/project' },
      );
      expect(result).toBe('/custom/output');
    });

    it('defaults outputDir to <projectDir>/dist', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['ios-abc123.js']);

      const result = await runExpoExport('ios', '/my/app');

      expect(result).toBe('/my/app/dist');
    });

    it('returns the resolved output directory path', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['bundle.js']);

      const result = await runExpoExport('ios', '/project', '/out');

      expect(result).toBe('/out');
    });

    it('throws when output directory does not exist after export', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(false);

      await expect(runExpoExport('ios', '/project')).rejects.toThrow(
        'expo export did not generate the output directory',
      );
    });

    it('throws when output directory is empty', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      await expect(runExpoExport('ios', '/project')).rejects.toThrow(
        'expo export output directory',
      );
    });

    it('includes "is empty" in the error message for empty directory', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([]);

      await expect(runExpoExport('ios', '/project')).rejects.toThrow(
        'is empty',
      );
    });

    it('logs info messages before and after export', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['bundle.js', 'assets']);

      await runExpoExport('ios', '/project');

      expect(core.info).toHaveBeenCalledWith('Running expo export for ios...');
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('expo export complete: 2 file(s)'),
      );
    });

    it('logs correct file count', async () => {
      mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['a.js', 'b.js', 'c.js']);

      await runExpoExport('android', '/project');

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('3 file(s)'),
      );
    });

    it('propagates errors from runCommand', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: npx expo export (exit code 1)'),
      );

      await expect(runExpoExport('ios', '/project')).rejects.toThrow(
        'Command failed: npx expo export',
      );
    });
  });
});
