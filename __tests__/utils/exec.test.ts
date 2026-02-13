import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import { runCommand } from '../../src/utils/exec';

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

describe('utils/exec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runCommand', () => {
    it('captures stdout and stderr from the command', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('hello stdout'));
        options?.listeners?.stderr?.(Buffer.from('hello stderr'));
        return 0;
      });

      const result = await runCommand('echo', ['hello']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello stdout');
      expect(result.stderr).toBe('hello stderr');
    });

    it('logs the command being run with args', async () => {
      mockExec.mockResolvedValue(0);

      await runCommand('fastlane', ['build']);

      expect(core.info).toHaveBeenCalledWith('Running: fastlane build');
    });

    it('logs command without args when none provided', async () => {
      mockExec.mockResolvedValue(0);

      await runCommand('ls');

      expect(core.info).toHaveBeenCalledWith('Running: ls');
    });

    it('throws on non-zero exit code with command info in message', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stderr?.(Buffer.from('build failed: missing scheme'));
        return 1;
      });

      await expect(runCommand('xcodebuild', ['-workspace', 'Foo.xcworkspace']))
        .rejects
        .toThrow('Command failed: xcodebuild -workspace Foo.xcworkspace (exit code 1)');
    });

    it('includes stderr content in the thrown error', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stderr?.(Buffer.from('fatal: something broke'));
        return 127;
      });

      await expect(runCommand('bad-cmd'))
        .rejects
        .toThrow('fatal: something broke');
    });

    it('passes options through to @actions/exec', async () => {
      mockExec.mockResolvedValue(0);

      await runCommand('echo', ['test'], { cwd: '/tmp' });

      expect(mockExec).toHaveBeenCalledWith(
        'echo',
        ['test'],
        expect.objectContaining({ cwd: '/tmp' })
      );
    });

    it('preserves existing listeners from options', async () => {
      const customStdout = jest.fn();
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('data'));
        return 0;
      });

      await runCommand('echo', ['test'], {
        listeners: { stdout: customStdout },
      });

      expect(customStdout).toHaveBeenCalledWith(Buffer.from('data'));
    });

    it('accumulates multiple stdout chunks', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('chunk1'));
        options?.listeners?.stdout?.(Buffer.from('chunk2'));
        return 0;
      });

      const result = await runCommand('cat', ['file.txt']);

      expect(result.stdout).toBe('chunk1chunk2');
    });
  });
});
