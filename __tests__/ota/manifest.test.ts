import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import * as actionsExec from '@actions/exec';
import {
  generateManifest,
  writeManifest,
  readRuntimeVersion,
  UpdateManifest,
} from '../../src/ota/manifest';

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

/**
 * Helper to make mockExec write to the stdout listener, simulating command output.
 */
function mockExecStdout(output: string): void {
  mockExec.mockImplementation(async (_cmd, _args, options) => {
    options?.listeners?.stdout?.(Buffer.from(output));
    return 0;
  });
}

/**
 * Helper to make mockExec throw (simulating a failed command).
 */
function mockExecFailure(stderr: string): void {
  mockExec.mockImplementation(async (_cmd, _args, options) => {
    options?.listeners?.stderr?.(Buffer.from(stderr));
    return 128;
  });
}

describe('ota/manifest', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-manifest-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('generateManifest', () => {
    it('generates a manifest with the correct structure', async () => {
      // Create mock dist directory with a bundle
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-abc123.js'), 'console.log("bundle");');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com/updates',
        platform: 'ios',
      });

      expect(manifest.id).toBeDefined();
      expect(manifest.createdAt).toBeDefined();
      expect(manifest.runtimeVersion).toBe('1.0.0');
      expect(manifest.launchAsset).toBeDefined();
      expect(manifest.assets).toEqual([]);
      expect(manifest.metadata).toEqual({});
      expect(manifest.extra).toEqual({});
    });

    it('generates a valid UUID for the manifest id', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-abc123.js'), 'bundle');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      // UUID v4 format
      expect(manifest.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('generates a valid ISO timestamp for createdAt', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'android-def456.js'), 'bundle');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '2.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      const parsed = new Date(manifest.createdAt);
      expect(parsed.toISOString()).toBe(manifest.createdAt);
    });

    it('identifies the correct launch asset for ios', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      const bundleContent = 'console.log("ios bundle");';
      fs.writeFileSync(path.join(distDir, 'ios-abc123.js'), bundleContent);

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.launchAsset.key).toBe('ios-abc123');
      expect(manifest.launchAsset.contentType).toBe('application/javascript');
      expect(manifest.launchAsset.fileExtension).toBe('.js');
      expect(manifest.launchAsset.url).toBe('https://cdn.example.com/ios-abc123.js');
    });

    it('identifies the correct launch asset for android', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'android-xyz789.js'), 'bundle');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.launchAsset.key).toBe('android-xyz789');
      expect(manifest.launchAsset.url).toBe('https://cdn.example.com/android-xyz789.js');
    });

    it('computes SHA-256 hash for the launch asset', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      const bundleContent = 'console.log("test bundle");';
      fs.writeFileSync(path.join(distDir, 'ios-abc.js'), bundleContent);

      const expectedHash = crypto
        .createHash('sha256')
        .update(Buffer.from(bundleContent))
        .digest('base64url');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.launchAsset.hash).toBe(expectedHash);
    });

    it('scans assets directory and includes all files', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-bundle.js'), 'bundle');

      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      fs.writeFileSync(path.join(assetsDir, 'logo.png'), 'fake-png-data');
      fs.writeFileSync(path.join(assetsDir, 'font.ttf'), 'fake-font-data');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.assets).toHaveLength(2);

      const assetKeys = manifest.assets.map((a) => a.key).sort();
      expect(assetKeys).toEqual(['font', 'logo']);
    });

    it('assigns correct content types to assets', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-bundle.js'), 'bundle');

      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      fs.writeFileSync(path.join(assetsDir, 'icon.png'), 'png');
      fs.writeFileSync(path.join(assetsDir, 'roboto.ttf'), 'ttf');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      const pngAsset = manifest.assets.find((a) => a.key === 'icon');
      expect(pngAsset?.contentType).toBe('image/png');
      expect(pngAsset?.fileExtension).toBe('.png');

      const ttfAsset = manifest.assets.find((a) => a.key === 'roboto');
      expect(ttfAsset?.contentType).toBe('font/ttf');
      expect(ttfAsset?.fileExtension).toBe('.ttf');
    });

    it('builds correct URLs for assets', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-bundle.js'), 'bundle');

      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      fs.writeFileSync(path.join(assetsDir, 'splash.png'), 'png');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com/v1',
        platform: 'ios',
      });

      const splashAsset = manifest.assets.find((a) => a.key === 'splash');
      expect(splashAsset?.url).toBe('https://cdn.example.com/v1/assets/splash.png');
    });

    it('handles nested asset directories', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-bundle.js'), 'bundle');

      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      const nestedDir = path.join(assetsDir, 'images');
      fs.mkdirSync(nestedDir);
      fs.writeFileSync(path.join(nestedDir, 'icon.png'), 'png');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.assets).toHaveLength(1);
      expect(manifest.assets[0].url).toBe('https://cdn.example.com/assets/images/icon.png');
    });

    it('returns empty assets array when assets directory does not exist', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-bundle.js'), 'bundle');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.assets).toEqual([]);
    });

    it('throws when no bundle is found for the platform', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      // No bundle file created

      await expect(
        generateManifest({
          distDir,
          runtimeVersion: '1.0.0',
          baseUrl: 'https://cdn.example.com',
          platform: 'ios',
        }),
      ).rejects.toThrow('No bundle file found for platform "ios"');
    });

    it('throws when bundle exists for wrong platform', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'android-abc.js'), 'bundle');

      await expect(
        generateManifest({
          distDir,
          runtimeVersion: '1.0.0',
          baseUrl: 'https://cdn.example.com',
          platform: 'ios',
        }),
      ).rejects.toThrow('No bundle file found for platform "ios"');
    });
  });

  // ---------------------------------------------------------------------------
  // SDK 54+ format (metadata.json + _expo/static/js/ + HBC bundles)
  // ---------------------------------------------------------------------------
  describe('generateManifest (SDK 54+ format)', () => {
    function writeMetadata(
      distDir: string,
      fileMetadata: Record<string, { bundle: string; assets: Array<{ ext: string; path: string }> }>,
    ): void {
      fs.writeFileSync(
        path.join(distDir, 'metadata.json'),
        JSON.stringify({
          version: 0,
          bundler: 'metro',
          fileMetadata,
        }),
      );
    }

    it('finds HBC bundle via metadata.json', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'android');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'AppEntry-abc123.hbc'), 'hermes bytecode');

      writeMetadata(distDir, {
        android: {
          bundle: '_expo/static/js/android/AppEntry-abc123.hbc',
          assets: [],
        },
      });

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.launchAsset.key).toBe('AppEntry-abc123');
      expect(manifest.launchAsset.contentType).toBe('application/javascript');
      expect(manifest.launchAsset.fileExtension).toBe('.hbc');
      expect(manifest.launchAsset.url).toBe(
        'https://cdn.example.com/_expo/static/js/android/AppEntry-abc123.hbc',
      );
    });

    it('finds iOS HBC bundle via metadata.json', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'ios');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'entry-def456.hbc'), 'hermes bytecode');

      writeMetadata(distDir, {
        ios: {
          bundle: '_expo/static/js/ios/entry-def456.hbc',
          assets: [],
        },
      });

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '2.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.launchAsset.key).toBe('entry-def456');
      expect(manifest.launchAsset.fileExtension).toBe('.hbc');
    });

    it('reads assets from metadata.json with extension info', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'android');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'AppEntry-abc.hbc'), 'bundle');

      // SDK 54 assets are hash-only filenames with no extension
      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      fs.writeFileSync(path.join(assetsDir, 'b6c297a501e289394b0bc5dc69c265e6'), 'fake-png');
      fs.writeFileSync(path.join(assetsDir, '5974eb3e1c5314e8d5a822702d7d0740'), 'fake-ttf');

      writeMetadata(distDir, {
        android: {
          bundle: '_expo/static/js/android/AppEntry-abc.hbc',
          assets: [
            { ext: 'png', path: 'assets/b6c297a501e289394b0bc5dc69c265e6' },
            { ext: 'ttf', path: 'assets/5974eb3e1c5314e8d5a822702d7d0740' },
          ],
        },
      });

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.assets).toHaveLength(2);

      const pngAsset = manifest.assets.find((a) => a.fileExtension === '.png');
      expect(pngAsset).toBeDefined();
      expect(pngAsset?.contentType).toBe('image/png');
      expect(pngAsset?.url).toBe('https://cdn.example.com/assets/b6c297a501e289394b0bc5dc69c265e6');

      const ttfAsset = manifest.assets.find((a) => a.fileExtension === '.ttf');
      expect(ttfAsset).toBeDefined();
      expect(ttfAsset?.contentType).toBe('font/ttf');
    });

    it('skips assets listed in metadata.json that do not exist on disk', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'ios');
      fs.mkdirSync(bundleDir, { recursive: true });
      fs.writeFileSync(path.join(bundleDir, 'AppEntry-abc.hbc'), 'bundle');

      const assetsDir = path.join(distDir, 'assets');
      fs.mkdirSync(assetsDir);
      // Only create one of two referenced assets
      fs.writeFileSync(path.join(assetsDir, 'exists123'), 'data');

      writeMetadata(distDir, {
        ios: {
          bundle: '_expo/static/js/ios/AppEntry-abc.hbc',
          assets: [
            { ext: 'png', path: 'assets/exists123' },
            { ext: 'ttf', path: 'assets/missing456' },
          ],
        },
      });

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.assets).toHaveLength(1);
      expect(manifest.assets[0].fileExtension).toBe('.png');
    });

    it('falls back to legacy scan when metadata.json is missing', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'android-oldformat.js'), 'legacy bundle');
      // No metadata.json

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.launchAsset.key).toBe('android-oldformat');
      expect(manifest.launchAsset.fileExtension).toBe('.js');
    });

    it('falls back to legacy scan when metadata.json has no entry for platform', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'ios-fallback.js'), 'bundle');

      writeMetadata(distDir, {
        android: {
          bundle: '_expo/static/js/android/AppEntry-abc.hbc',
          assets: [],
        },
        // No ios entry
      });

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.launchAsset.key).toBe('ios-fallback');
    });

    it('falls back to legacy .hbc scan in dist root', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'android-abc.hbc'), 'hermes');
      // No metadata.json

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.launchAsset.key).toBe('android-abc');
      expect(manifest.launchAsset.fileExtension).toBe('.hbc');
    });

    it('computes correct hash for HBC bundle', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const bundleDir = path.join(distDir, '_expo', 'static', 'js', 'android');
      fs.mkdirSync(bundleDir, { recursive: true });
      const bundleContent = 'hermes bytecode content';
      fs.writeFileSync(path.join(bundleDir, 'AppEntry-xyz.hbc'), bundleContent);

      writeMetadata(distDir, {
        android: {
          bundle: '_expo/static/js/android/AppEntry-xyz.hbc',
          assets: [],
        },
      });

      const expectedHash = crypto
        .createHash('sha256')
        .update(Buffer.from(bundleContent))
        .digest('base64url');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });

      expect(manifest.launchAsset.hash).toBe(expectedHash);
    });

    it('handles metadata.json with invalid JSON gracefully (falls back)', async () => {
      const distDir = path.join(tmpDir, 'dist');
      fs.mkdirSync(distDir);
      fs.writeFileSync(path.join(distDir, 'metadata.json'), '{ broken json');
      fs.writeFileSync(path.join(distDir, 'ios-fallback.js'), 'bundle');

      const manifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });

      expect(manifest.launchAsset.key).toBe('ios-fallback');
    });

    it('handles multi-platform metadata.json selecting correct platform', async () => {
      const distDir = path.join(tmpDir, 'dist');
      const androidDir = path.join(distDir, '_expo', 'static', 'js', 'android');
      const iosDir = path.join(distDir, '_expo', 'static', 'js', 'ios');
      fs.mkdirSync(androidDir, { recursive: true });
      fs.mkdirSync(iosDir, { recursive: true });
      fs.writeFileSync(path.join(androidDir, 'AppEntry-aaa.hbc'), 'android bundle');
      fs.writeFileSync(path.join(iosDir, 'AppEntry-bbb.hbc'), 'ios bundle');

      writeMetadata(distDir, {
        android: {
          bundle: '_expo/static/js/android/AppEntry-aaa.hbc',
          assets: [],
        },
        ios: {
          bundle: '_expo/static/js/ios/AppEntry-bbb.hbc',
          assets: [],
        },
      });

      const androidManifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'android',
      });
      expect(androidManifest.launchAsset.key).toBe('AppEntry-aaa');

      const iosManifest = await generateManifest({
        distDir,
        runtimeVersion: '1.0.0',
        baseUrl: 'https://cdn.example.com',
        platform: 'ios',
      });
      expect(iosManifest.launchAsset.key).toBe('AppEntry-bbb');
    });
  });

  describe('writeManifest', () => {
    it('writes manifest as formatted JSON to the given path', async () => {
      const manifest: UpdateManifest = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        createdAt: '2024-01-15T10:30:00.000Z',
        runtimeVersion: '1.0.0',
        launchAsset: {
          hash: 'abc123',
          key: 'ios-bundle',
          contentType: 'application/javascript',
          fileExtension: '.js',
          url: 'https://cdn.example.com/ios-bundle.js',
        },
        assets: [],
        metadata: {},
        extra: {},
      };

      const outputPath = path.join(tmpDir, 'manifest.json');
      await writeManifest(manifest, outputPath);

      const written = fs.readFileSync(outputPath, 'utf-8');
      const parsed = JSON.parse(written);

      expect(parsed.id).toBe(manifest.id);
      expect(parsed.runtimeVersion).toBe('1.0.0');
      expect(parsed.launchAsset.key).toBe('ios-bundle');
    });

    it('creates parent directories if they do not exist', async () => {
      const manifest: UpdateManifest = {
        id: 'test-id',
        createdAt: '2024-01-15T10:30:00.000Z',
        runtimeVersion: '1.0.0',
        launchAsset: {
          hash: 'abc',
          key: 'ios-bundle',
          contentType: 'application/javascript',
          fileExtension: '.js',
          url: 'https://cdn.example.com/ios-bundle.js',
        },
        assets: [],
        metadata: {},
        extra: {},
      };

      const nested = path.join(tmpDir, 'deep', 'nested', 'dir', 'manifest.json');
      await writeManifest(manifest, nested);

      expect(fs.existsSync(nested)).toBe(true);
    });

    it('writes pretty-printed JSON (indented with 2 spaces)', async () => {
      const manifest: UpdateManifest = {
        id: 'test-id',
        createdAt: '2024-01-15T10:30:00.000Z',
        runtimeVersion: '1.0.0',
        launchAsset: {
          hash: 'abc',
          key: 'ios-bundle',
          contentType: 'application/javascript',
          fileExtension: '.js',
          url: 'https://cdn.example.com/ios-bundle.js',
        },
        assets: [],
        metadata: {},
        extra: {},
      };

      const outputPath = path.join(tmpDir, 'manifest.json');
      await writeManifest(manifest, outputPath);

      const written = fs.readFileSync(outputPath, 'utf-8');
      expect(written).toBe(JSON.stringify(manifest, null, 2));
    });
  });

  describe('readRuntimeVersion', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('reads runtimeVersion from expo.runtimeVersion in app.json', async () => {
      const projectDir = path.join(tmpDir, 'project-expo');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          expo: {
            name: 'MyApp',
            runtimeVersion: '2.5.0',
          },
        }),
      );

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('2.5.0');
    });

    it('reads runtimeVersion from top-level runtimeVersion in app.json', async () => {
      const projectDir = path.join(tmpDir, 'project-top');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          name: 'MyApp',
          runtimeVersion: '3.0.0',
        }),
      );

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('3.0.0');
    });

    it('prefers expo.runtimeVersion over top-level runtimeVersion', async () => {
      const projectDir = path.join(tmpDir, 'project-both');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          runtimeVersion: '1.0.0',
          expo: {
            runtimeVersion: '2.0.0',
          },
        }),
      );

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('2.0.0');
    });

    it('throws when runtimeVersion is not found in app.json', async () => {
      const projectDir = path.join(tmpDir, 'project-none');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          expo: {
            name: 'MyApp',
          },
        }),
      );

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'runtimeVersion is required in app.json for OTA updates',
      );
    });

    it('throws when app.json does not exist and no dynamic config', async () => {
      const projectDir = path.join(tmpDir, 'no-app-json');
      fs.mkdirSync(projectDir);

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'Failed to read app.json',
      );
    });

    it('throws when app.json contains invalid JSON', async () => {
      const projectDir = path.join(tmpDir, 'bad-json');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'app.json'), '{ not valid }');

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'invalid JSON',
      );
    });

    it('throws when runtimeVersion is not a string', async () => {
      const projectDir = path.join(tmpDir, 'numeric-version');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          expo: {
            runtimeVersion: 123,
          },
        }),
      );

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'runtimeVersion is required in app.json for OTA updates',
      );
    });

    it('throws when expo key exists but has no runtimeVersion and no top-level version', async () => {
      const projectDir = path.join(tmpDir, 'empty-expo');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({
          expo: {},
        }),
      );

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'runtimeVersion is required in app.json for OTA updates',
      );
    });

    // --- Dynamic config tests ---

    it('reads runtimeVersion from app.config.js via npx expo config', async () => {
      const projectDir = path.join(tmpDir, 'dynamic-js');
      fs.mkdirSync(projectDir);
      // No app.json, only app.config.js
      fs.writeFileSync(path.join(projectDir, 'app.config.js'), 'module.exports = {};');

      mockExecStdout(JSON.stringify({ runtimeVersion: '3.2.1' }));

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('3.2.1');
    });

    it('reads runtimeVersion from app.config.ts via npx expo config', async () => {
      const projectDir = path.join(tmpDir, 'dynamic-ts');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'app.config.ts'), 'export default {};');

      mockExecStdout(JSON.stringify({ runtimeVersion: '4.0.0' }));

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('4.0.0');
    });

    it('falls back to dynamic config when app.json has no runtimeVersion', async () => {
      const projectDir = path.join(tmpDir, 'fallback-dynamic');
      fs.mkdirSync(projectDir);
      // app.json exists but has no runtimeVersion
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({ expo: { name: 'MyApp' } }),
      );
      // app.config.js also exists
      fs.writeFileSync(path.join(projectDir, 'app.config.js'), 'module.exports = {};');

      mockExecStdout(JSON.stringify({ runtimeVersion: '5.0.0' }));

      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('5.0.0');
    });

    it('throws when dynamic config exists but has no runtimeVersion', async () => {
      const projectDir = path.join(tmpDir, 'dynamic-no-rv');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'app.config.js'), 'module.exports = {};');

      mockExecStdout(JSON.stringify({ name: 'NoVersionApp' }));

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'runtimeVersion is required',
      );
    });

    it('throws when dynamic config resolution fails', async () => {
      const projectDir = path.join(tmpDir, 'dynamic-fail');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(path.join(projectDir, 'app.config.js'), 'module.exports = {};');

      mockExecFailure('expo: command not found');

      await expect(readRuntimeVersion(projectDir)).rejects.toThrow(
        'runtimeVersion is required',
      );
    });

    it('prefers app.json runtimeVersion over dynamic config', async () => {
      const projectDir = path.join(tmpDir, 'prefer-appjson');
      fs.mkdirSync(projectDir);
      fs.writeFileSync(
        path.join(projectDir, 'app.json'),
        JSON.stringify({ expo: { runtimeVersion: '1.0.0' } }),
      );
      fs.writeFileSync(path.join(projectDir, 'app.config.js'), 'module.exports = {};');

      // npx expo config should NOT be called
      const version = await readRuntimeVersion(projectDir);
      expect(version).toBe('1.0.0');
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});
