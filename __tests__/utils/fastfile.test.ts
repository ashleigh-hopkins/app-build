import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateFastfile,
  iosBuildFastfile,
  androidBuildFastfile,
  iosSubmitFastfile,
  androidSubmitFastfile,
} from '../../src/utils/fastfile';
import { registerCleanupFile } from '../../src/utils/cleanup';

jest.mock('../../src/utils/cleanup', () => ({
  registerCleanupFile: jest.fn(),
}));

describe('utils/fastfile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'fastfile-test-')
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  describe('generateFastfile', () => {
    it('writes content to <directory>/fastlane/Fastfile and returns the path', async () => {
      const content = 'lane :build do\nend';
      const result = await generateFastfile(content, tmpDir);

      expect(result).toBe(path.join(tmpDir, 'fastlane', 'Fastfile'));
      const written = await fs.promises.readFile(result, 'utf8');
      expect(written).toBe(content);
    });

    it('creates the directory if it does not exist', async () => {
      const nestedDir = path.join(tmpDir, 'fastlane', 'ios');
      await generateFastfile('content', nestedDir);

      const stat = await fs.promises.stat(nestedDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('registers the Fastfile for cleanup', async () => {
      await generateFastfile('content', tmpDir);

      expect(registerCleanupFile).toHaveBeenCalledWith(
        path.join(tmpDir, 'fastlane', 'Fastfile')
      );
    });
  });

  describe('iosBuildFastfile', () => {
    it('generates a valid iOS build Fastfile with all parameters', () => {
      const result = iosBuildFastfile({
        workspace: 'ios/MyApp.xcworkspace',
        scheme: 'MyApp',
        configuration: 'Release',
        exportMethod: 'app-store',
        outputDir: './build',
        outputName: 'MyApp.ipa',
      });

      expect(result).toContain('default_platform(:ios)');
      expect(result).toContain('platform :ios do');
      expect(result).toContain('lane :build do');
      expect(result).toContain('setup_ci');
      expect(result).toContain('build_app(');
      expect(result).toContain('workspace: "ios/MyApp.xcworkspace"');
      expect(result).toContain('scheme: "MyApp"');
      expect(result).toContain('configuration: "Release"');
      expect(result).toContain('export_method: "app-store"');
      expect(result).toContain('output_directory: "./build"');
      expect(result).toContain('output_name: "MyApp.ipa"');
      expect(result).toContain('clean: false');
      expect(result).toContain('include_bitcode: false');
    });

    it('substitutes different export methods correctly', () => {
      const result = iosBuildFastfile({
        workspace: 'ios/App.xcworkspace',
        scheme: 'App',
        configuration: 'Debug',
        exportMethod: 'development',
        outputDir: '/tmp/out',
        outputName: 'App-dev.ipa',
      });

      expect(result).toContain('export_method: "development"');
      expect(result).toContain('configuration: "Debug"');
    });
  });

  describe('androidBuildFastfile', () => {
    it('generates a valid Android build Fastfile with all parameters', () => {
      const result = androidBuildFastfile({
        projectDir: './android',
        task: 'bundle',
        buildType: 'Release',
      });

      expect(result).toContain('default_platform(:android)');
      expect(result).toContain('platform :android do');
      expect(result).toContain('lane :build do');
      expect(result).toContain('gradle(');
      expect(result).toContain('project_dir: "./android"');
      expect(result).toContain('task: "bundle"');
      expect(result).toContain('build_type: "Release"');
      expect(result).toContain('print_command: false');
    });

    it('generates correct content for assemble task', () => {
      const result = androidBuildFastfile({
        projectDir: './android',
        task: 'assemble',
        buildType: 'debug',
      });

      expect(result).toContain('task: "assemble"');
      expect(result).toContain('build_type: "debug"');
    });
  });

  describe('iosSubmitFastfile', () => {
    it('generates a valid iOS submit Fastfile for TestFlight', () => {
      const result = iosSubmitFastfile({
        ipaPath: './build/MyApp.ipa',
      });

      expect(result).toContain('default_platform(:ios)');
      expect(result).toContain('lane :submit do');
      expect(result).toContain('app_store_connect_api_key(');
      expect(result).toContain('key_id: ENV["ASC_API_KEY_ID"]');
      expect(result).toContain('issuer_id: ENV["ASC_API_ISSUER_ID"]');
      expect(result).toContain('key_filepath: ENV["ASC_API_KEY_PATH"]');
      expect(result).toContain('in_house: false');
      expect(result).toContain('upload_to_testflight(');
      expect(result).toContain('ipa: "./build/MyApp.ipa"');
      expect(result).toContain('skip_waiting_for_build_processing: true');
    });
  });

  describe('androidSubmitFastfile', () => {
    it('generates a valid Android submit Fastfile for Google Play', () => {
      const result = androidSubmitFastfile({
        packageName: 'com.example.myapp',
        track: 'internal',
        aabPath: './build/app-release.aab',
      });

      expect(result).toContain('default_platform(:android)');
      expect(result).toContain('lane :submit do');
      expect(result).toContain('supply(');
      expect(result).toContain('json_key: ENV["GOOGLE_PLAY_JSON_KEY_PATH"]');
      expect(result).toContain('package_name: "com.example.myapp"');
      expect(result).toContain('track: "internal"');
      expect(result).toContain('aab: "./build/app-release.aab"');
      expect(result).toContain('release_status: "draft"');
      expect(result).toContain('skip_upload_metadata: true');
      expect(result).toContain('skip_upload_images: true');
      expect(result).toContain('skip_upload_screenshots: true');
    });

    it('generates correct content for production track', () => {
      const result = androidSubmitFastfile({
        packageName: 'com.example.prod',
        track: 'production',
        aabPath: '/tmp/output/app.aab',
      });

      expect(result).toContain('track: "production"');
      expect(result).toContain('package_name: "com.example.prod"');
      expect(result).toContain('aab: "/tmp/output/app.aab"');
    });
  });
});
