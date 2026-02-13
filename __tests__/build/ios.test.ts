import * as path from 'path';
import * as fs from 'fs';
import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { DefaultArtifactClient } from '@actions/artifact';
import { buildIos, detectWorkspace } from '../../src/build/ios';
import { runCommand } from '../../src/utils/exec';
import { generateFastfile } from '../../src/utils/fastfile';

jest.mock('fs');
jest.mock('../../src/utils/exec');
jest.mock('../../src/utils/fastfile', () => ({
  iosBuildFastfile: jest.requireActual('../../src/utils/fastfile').iosBuildFastfile,
  generateFastfile: jest.fn().mockResolvedValue('/project/Fastfile'),
}));

const mockRunCommand = runCommand as jest.MockedFunction<typeof runCommand>;
const mockGenerateFastfile = generateFastfile as jest.MockedFunction<
  typeof generateFastfile
>;
const mockGlobCreate = glob.create as jest.MockedFunction<typeof glob.create>;
const mockReaddirSync = fs.readdirSync as jest.Mock;

function setupGlobMock(files: string[]): void {
  mockGlobCreate.mockResolvedValue({
    glob: jest.fn().mockResolvedValue(files),
    getSearchPaths: jest.fn().mockReturnValue([]),
    globGenerator: jest.fn(),
  } as unknown as ReturnType<typeof glob.create> extends Promise<infer T> ? T : never);
}

describe('build/ios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRunCommand.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' });
  });

  describe('detectWorkspace', () => {
    it('returns the path to the first non-Pods xcworkspace', () => {
      mockReaddirSync.mockReturnValue([
        'Pods.xcworkspace',
        'MyApp.xcworkspace',
      ]);

      const result = detectWorkspace('/project');

      expect(result).toBe(path.join('/project', 'ios', 'MyApp.xcworkspace'));
    });

    it('ignores Pods.xcworkspace', () => {
      mockReaddirSync.mockReturnValue([
        'Pods.xcworkspace',
        'RealApp.xcworkspace',
        'Other.xcworkspace',
      ]);

      const result = detectWorkspace('/project');

      expect(result).toBe(path.join('/project', 'ios', 'RealApp.xcworkspace'));
    });

    it('throws when no xcworkspace is found', () => {
      mockReaddirSync.mockReturnValue([
        'Pods.xcworkspace',
        'SomeFile.swift',
      ]);

      expect(() => detectWorkspace('/project')).toThrow(
        'No .xcworkspace found'
      );
    });

    it('throws when only Pods.xcworkspace exists', () => {
      mockReaddirSync.mockReturnValue([
        'Pods.xcworkspace',
      ]);

      expect(() => detectWorkspace('/project')).toThrow(
        'No .xcworkspace found'
      );
    });

    it('throws with helpful message when ios directory does not exist', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      expect(() => detectWorkspace('/project')).toThrow(
        'Could not read ios/ directory'
      );
    });

    it('reads from <projectDir>/ios/', () => {
      mockReaddirSync.mockReturnValue([
        'App.xcworkspace',
      ]);

      detectWorkspace('/my/custom/dir');

      expect(mockReaddirSync).toHaveBeenCalledWith(
        path.join('/my/custom/dir', 'ios')
      );
    });
  });

  describe('buildIos', () => {
    function setupWorkspaceMock(name = 'MyApp.xcworkspace'): void {
      mockReaddirSync.mockReturnValue([
        'Pods.xcworkspace',
        name,
      ]);
    }

    it('detects workspace and uses scheme from config', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'CustomScheme', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('scheme: "CustomScheme"'),
        '/project'
      );
    });

    it('derives scheme from workspace name when config.scheme is empty', async () => {
      setupWorkspaceMock('CoolApp.xcworkspace');
      setupGlobMock(['/project/build/CoolApp.ipa']);

      await buildIos(
        { scheme: '', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('scheme: "CoolApp"'),
        '/project'
      );
    });

    it('generates Fastfile with detected workspace path', async () => {
      setupWorkspaceMock('MyApp.xcworkspace');
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      const expectedWorkspace = path.join('/project', 'ios', 'MyApp.xcworkspace');
      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining(`workspace: "${expectedWorkspace}"`),
        '/project'
      );
    });

    it('passes buildConfiguration to Fastfile', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Debug', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('configuration: "Debug"'),
        '/project'
      );
    });

    it('defaults buildConfiguration to Release', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: '' as 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('configuration: "Release"'),
        '/project'
      );
    });

    it('passes exportMethod to Fastfile', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'ad-hoc' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('export_method: "ad-hoc"'),
        '/project'
      );
    });

    it('defaults exportMethod to app-store', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: '' as 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('export_method: "app-store"'),
        '/project'
      );
    });

    it('sets output_name to <scheme>.ipa', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/TestScheme.ipa']);

      await buildIos(
        { scheme: 'TestScheme', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGenerateFastfile).toHaveBeenCalledWith(
        expect.stringContaining('output_name: "TestScheme.ipa"'),
        '/project'
      );
    });

    it('runs the fastlane ios build command', async () => {
      setupWorkspaceMock();
      setupGlobMock(['/project/build/MyApp.ipa']);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockRunCommand).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'ios', 'build'],
        { cwd: '/project' }
      );
    });

    it('searches for *.ipa in the build directory', async () => {
      setupWorkspaceMock();
      const buildDir = path.join('/project', 'build');
      setupGlobMock([`${buildDir}/MyApp.ipa`]);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(mockGlobCreate).toHaveBeenCalledWith(`${buildDir}/**/*.ipa`);
    });

    it('uploads the artifact with name ios-build', async () => {
      setupWorkspaceMock();
      const artifactPath = '/project/build/MyApp.ipa';
      setupGlobMock([artifactPath]);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      const clientInstance = (DefaultArtifactClient as jest.Mock).mock.results[0].value;
      expect(clientInstance.uploadArtifact).toHaveBeenCalledWith(
        'ios-build',
        [artifactPath],
        expect.any(String)
      );
    });

    it('sets the artifact-path output', async () => {
      setupWorkspaceMock();
      const artifactPath = '/project/build/MyApp.ipa';
      setupGlobMock([artifactPath]);

      await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(core.setOutput).toHaveBeenCalledWith('artifact-path', artifactPath);
    });

    it('returns the artifact path', async () => {
      setupWorkspaceMock();
      const artifactPath = '/project/build/MyApp.ipa';
      setupGlobMock([artifactPath]);

      const result = await buildIos(
        { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        '/project'
      );

      expect(result).toBe(artifactPath);
    });

    it('throws when no artifact is found', async () => {
      setupWorkspaceMock();
      setupGlobMock([]);

      await expect(
        buildIos(
          { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
          '/project'
        )
      ).rejects.toThrow('No artifact found');
    });

    it('propagates errors from runCommand', async () => {
      setupWorkspaceMock();
      mockRunCommand.mockRejectedValue(
        new Error('Command failed: bundle exec fastlane ios build (exit code 1)')
      );

      await expect(
        buildIos(
          { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
          '/project'
        )
      ).rejects.toThrow('Command failed: bundle exec fastlane ios build');
    });

    it('throws when workspace detection fails', async () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      await expect(
        buildIos(
          { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
          '/project'
        )
      ).rejects.toThrow('Could not read ios/ directory');
    });
  });
});
