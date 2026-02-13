import * as path from 'path';
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { DefaultArtifactClient } from '@actions/artifact';
import { buildAndroid, getAndroidArtifactDir } from '../../src/build/android';
import { runCommand } from '../../src/utils/exec';
import { generateFastfile } from '../../src/utils/fastfile';

jest.mock('fs');
jest.mock('../../src/utils/exec');
jest.mock('../../src/utils/fastfile', () => ({
  androidBuildFastfile: jest.requireActual('../../src/utils/fastfile').androidBuildFastfile,
  generateFastfile: jest.fn().mockResolvedValue('/project/Fastfile'),
}));

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockGenerateFastfile = generateFastfile as jest.MockedFunction<
  typeof generateFastfile
>;
const mockGlobCreate = glob.create as jest.MockedFunction<typeof glob.create>;

describe('build/android', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  describe('getAndroidArtifactDir', () => {
    it('returns the bundle directory for AAB builds', () => {
      const dir = getAndroidArtifactDir('/project', 'release', true);
      expect(dir).toBe(
        path.join('/project', 'android', 'app', 'build', 'outputs', 'bundle', 'release')
      );
    });

    it('returns the apk directory for APK builds', () => {
      const dir = getAndroidArtifactDir('/project', 'release', false);
      expect(dir).toBe(
        path.join('/project', 'android', 'app', 'build', 'outputs', 'apk', 'release')
      );
    });

    it('uses the provided buildType in the path', () => {
      const dir = getAndroidArtifactDir('/project', 'debug', true);
      expect(dir).toBe(
        path.join('/project', 'android', 'app', 'build', 'outputs', 'bundle', 'debug')
      );
    });
  });

  describe('buildAndroid', () => {
    function setupGlobMock(files: string[]): void {
      mockGlobCreate.mockResolvedValue({
        glob: jest.fn().mockResolvedValue(files),
        getSearchPaths: jest.fn().mockReturnValue([]),
        globGenerator: jest.fn(),
      } as unknown as ReturnType<typeof glob.create> extends Promise<infer T> ? T : never);
    }

    it('generates a Fastfile with bundle task when aab is true', async () => {
      setupGlobMock(['/project/android/app/build/outputs/bundle/release/app-release.aab']);

      await buildAndroid({ buildType: 'release', aab: true }, '/project');

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('task: "bundle"'),
        '/project'
      );
    });

    it('generates a Fastfile with bundle task when aab is undefined (default)', async () => {
      setupGlobMock(['/project/android/app/build/outputs/bundle/release/app-release.aab']);

      await buildAndroid({ buildType: 'release' }, '/project');

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('task: "bundle"'),
        '/project'
      );
    });

    it('generates a Fastfile with assemble task when aab is false', async () => {
      setupGlobMock(['/project/android/app/build/outputs/apk/release/app-release.apk']);

      await buildAndroid({ buildType: 'release', aab: false }, '/project');

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('task: "assemble"'),
        '/project'
      );
    });

    it('passes the correct projectDir to androidBuildFastfile', async () => {
      setupGlobMock(['/project/android/app/build/outputs/bundle/release/app-release.aab']);

      await buildAndroid({ buildType: 'release' }, '/project');

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining(`project_dir: "${path.join('/project', 'android')}"`),
        '/project'
      );
    });

    it('passes the correct buildType to androidBuildFastfile', async () => {
      setupGlobMock(['/project/android/app/build/outputs/bundle/debug/app-debug.aab']);

      await buildAndroid({ buildType: 'debug' }, '/project');

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('build_type: "debug"'),
        '/project'
      );
    });

    it('runs the fastlane android build command', async () => {
      setupGlobMock(['/project/android/app/build/outputs/bundle/release/app-release.aab']);

      await buildAndroid({ buildType: 'release' }, '/project');

      expect(mockRunCommand).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'android', 'build'],
        { cwd: '/project' }
      );
    });

    it('searches for *.aab in bundle directory when aab is true', async () => {
      const expectedDir = path.join(
        '/project', 'android', 'app', 'build', 'outputs', 'bundle', 'release'
      );
      setupGlobMock([`${expectedDir}/app-release.aab`]);

      await buildAndroid({ buildType: 'release', aab: true }, '/project');

      expect(mockGlobCreate).toHaveBeenCalledWith(`${expectedDir}/*.aab`);
    });

    it('searches for *.apk in apk directory when aab is false', async () => {
      const expectedDir = path.join(
        '/project', 'android', 'app', 'build', 'outputs', 'apk', 'release'
      );
      setupGlobMock([`${expectedDir}/app-release.apk`]);

      await buildAndroid({ buildType: 'release', aab: false }, '/project');

      expect(mockGlobCreate).toHaveBeenCalledWith(`${expectedDir}/*.apk`);
    });

    it('uploads the artifact with name android-build', async () => {
      const artifactPath =
        '/project/android/app/build/outputs/bundle/release/app-release.aab';
      setupGlobMock([artifactPath]);

      await buildAndroid({ buildType: 'release' }, '/project');

      // Grab the instance created inside uploadArtifact via the constructor mock
      const clientInstance = (DefaultArtifactClient as jest.Mock).mock.results[0].value;
      expect(clientInstance.uploadArtifact).toHaveBeenCalledWith(
        'android-build',
        [artifactPath],
        expect.any(String)
      );
    });

    it('sets the artifact-path output', async () => {
      const artifactPath =
        '/project/android/app/build/outputs/bundle/release/app-release.aab';
      setupGlobMock([artifactPath]);

      await buildAndroid({ buildType: 'release' }, '/project');

      expect(core.setOutput).toHaveBeenCalledWith('artifact-path', artifactPath);
    });

    it('returns the artifact path', async () => {
      const artifactPath =
        '/project/android/app/build/outputs/bundle/release/app-release.aab';
      setupGlobMock([artifactPath]);

      const result = await buildAndroid({ buildType: 'release' }, '/project');

      expect(result).toBe(artifactPath);
    });

    it('throws when no artifact is found', async () => {
      setupGlobMock([]);

      await expect(
        buildAndroid({ buildType: 'release' }, '/project')
      ).rejects.toThrow('No artifact found');
    });

    it('propagates errors from runCommand', async () => {
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: bundle exec fastlane android build (exit code 1)')
      );

      await expect(
        buildAndroid({ buildType: 'release' }, '/project')
      ).rejects.toThrow('Command failed: bundle exec fastlane android build');
    });
  });
});
