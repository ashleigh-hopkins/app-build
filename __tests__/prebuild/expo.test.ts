import * as fs from 'fs';
import * as core from '@actions/core';
import { runExpoPrebuild, verifyNativeProject } from '../../src/prebuild/expo';
import { runCommand } from '../../src/utils/exec';

jest.mock('fs');
jest.mock('../../src/utils/exec');

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;
const mockReaddirSync = fs.readdirSync as unknown as jest.Mock<
  string[],
  [string]
>;

describe('prebuild/expo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('runExpoPrebuild', () => {
    it('runs npx expo prebuild with correct args for android', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('android', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'android', '--no-install'],
        { cwd: '/project' }
      );
    });

    it('runs npx expo prebuild with correct args for ios', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('ios', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'ios', '--no-install'],
        { cwd: '/project' }
      );
    });

    it('logs info messages before and after prebuild', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('android', '/project');

      expect(core.info).toHaveBeenCalledWith(
        'Running expo prebuild for android...'
      );
      expect(core.info).toHaveBeenCalledWith(
        'expo prebuild complete for android'
      );
    });

    it('throws when the native directory does not exist after prebuild', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(false);

      await expect(runExpoPrebuild('android', '/project')).rejects.toThrow(
        'expo prebuild did not generate the android directory. Check your app.json configuration.'
      );
    });

    it('throws when the ios directory does not exist after prebuild', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(false);

      await expect(runExpoPrebuild('ios', '/project')).rejects.toThrow(
        'expo prebuild did not generate the ios directory. Check your app.json configuration.'
      );
    });

    it('propagates errors from runCommand', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: npx expo prebuild --platform android --no-install (exit code 1)')
      );

      await expect(runExpoPrebuild('android', '/project')).rejects.toThrow(
        'Command failed: npx expo prebuild'
      );
    });

    it('includes --clean flag when options.clean is true', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('android', '/project', { clean: true });

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'],
        { cwd: '/project' }
      );
    });

    it('does not include --clean flag when options.clean is false', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('ios', '/project', { clean: false });

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'ios', '--no-install'],
        { cwd: '/project' }
      );
    });

    it('does not include --clean flag when options is undefined', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('android', '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'npx',
        ['expo', 'prebuild', '--platform', 'android', '--no-install'],
        { cwd: '/project' }
      );
    });

    it('checks the correct native directory path', async () => {
      mockRunCommand.mockResolvedValue({
        exitCode: 0,
        stdout: '',
        stderr: '',
      });
      mockExistsSync.mockReturnValue(true);

      await runExpoPrebuild('ios', '/my/app');

      // fs.existsSync should be called with path.join('/my/app', 'ios')
      expect(mockExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('ios')
      );
    });
  });

  describe('verifyNativeProject', () => {
    describe('android', () => {
      it('succeeds when build.gradle exists', async () => {
        mockExistsSync.mockImplementation((p: fs.PathLike) => {
          if (String(p).endsWith('build.gradle')) return true;
          return false;
        });

        await expect(
          verifyNativeProject('android', '/project')
        ).resolves.toBeUndefined();
      });

      it('succeeds when build.gradle.kts exists', async () => {
        mockExistsSync.mockImplementation((p: fs.PathLike) => {
          if (String(p).endsWith('build.gradle.kts')) return true;
          return false;
        });

        await expect(
          verifyNativeProject('android', '/project')
        ).resolves.toBeUndefined();
      });

      it('throws when neither build.gradle nor build.gradle.kts exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await expect(
          verifyNativeProject('android', '/project')
        ).rejects.toThrow(
          'Android native project is missing android/app/build.gradle (or build.gradle.kts)'
        );
      });
    });

    describe('ios', () => {
      it('succeeds when an .xcworkspace file exists in ios/', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
          'MyApp.xcworkspace',
          'Podfile',
        ]);

        await expect(
          verifyNativeProject('ios', '/project')
        ).resolves.toBeUndefined();
      });

      it('throws when ios directory does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await expect(
          verifyNativeProject('ios', '/project')
        ).rejects.toThrow(
          'iOS native project directory (ios/) does not exist'
        );
      });

      it('throws when no .xcworkspace file exists in ios/', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
          'Podfile',
          'MyApp.xcodeproj',
        ]);

        await expect(
          verifyNativeProject('ios', '/project')
        ).rejects.toThrow(
          'iOS native project is missing an .xcworkspace file in the ios/ directory'
        );
      });

      it('detects .xcworkspace among multiple entries', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync.mockReturnValue([
          'Podfile',
          'Pods',
          'App.xcworkspace',
          'App.xcodeproj',
        ]);

        await expect(
          verifyNativeProject('ios', '/project')
        ).resolves.toBeUndefined();
      });
    });
  });
});
