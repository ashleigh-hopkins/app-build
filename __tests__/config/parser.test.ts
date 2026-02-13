import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseConfigFile, getProfileConfig, mergeActionInputs, ActionInputs } from '../../src/config/parser';
import { AppBuildConfig } from '../../src/config/schema';

const FIXTURES = path.resolve(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// parseConfigFile
// ---------------------------------------------------------------------------

describe('parseConfigFile', () => {
  describe('valid configs', () => {
    it('parses a full config with all sections', async () => {
      const config = await parseConfigFile(path.join(FIXTURES, 'valid-full.json'));

      // build profiles
      expect(Object.keys(config.build)).toEqual(['development', 'preview', 'production']);
      expect(config.build.production.ios).toEqual({
        scheme: 'MyApp',
        buildConfiguration: 'Release',
        exportMethod: 'app-store',
      });
      expect(config.build.production.android).toEqual({
        buildType: 'release',
        aab: true,
      });

      // submit
      expect(config.submit?.ios?.ascAppId).toBe('1234567890');
      expect(config.submit?.android?.packageName).toBe('com.example.myapp');
      expect(config.submit?.android?.track).toBe('internal');

      // signing (match)
      expect(config.signing?.ios).toEqual({
        method: 'match',
        type: 'appstore',
        storage: 'git',
        gitUrl: 'git@github.com:myorg/certificates.git',
        readonly: true,
      });
      expect(config.signing?.android).toEqual({ method: 'manual' });

      // updates
      expect(config.updates?.enabled).toBe(true);
      expect(config.updates?.storage?.type).toBe('s3');
      expect(config.updates?.storage?.bucket).toBe('my-app-updates');

      // version
      expect(config.version?.autoIncrement).toBe(true);
      expect(config.version?.source).toBe('app.json');
    });

    it('parses a minimal config (build section only)', async () => {
      const config = await parseConfigFile(path.join(FIXTURES, 'valid-minimal.json'));

      expect(Object.keys(config.build)).toEqual(['production']);
      expect(config.build.production.android).toEqual({ buildType: 'release' });
      expect(config.build.production.ios).toBeUndefined();
      expect(config.submit).toBeUndefined();
      expect(config.signing).toBeUndefined();
      expect(config.updates).toBeUndefined();
      expect(config.version).toBeUndefined();
    });
  });

  describe('invalid configs', () => {
    it('throws when the build key is missing', async () => {
      await expect(
        parseConfigFile(path.join(FIXTURES, 'invalid-missing-build.json')),
      ).rejects.toThrow(/Invalid config.*build/);
    });

    it('throws for invalid JSON', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badJsonPath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(badJsonPath, '{ not valid json }');

      await expect(parseConfigFile(badJsonPath)).rejects.toThrow(/invalid JSON/);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('returns empty config when config file does not exist', async () => {
      const result = await parseConfigFile('/no/such/file/app-build.json');
      expect(result).toEqual({});
    });

    it('accepts custom build configuration strings (e.g. Release-Production)', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const customConfigPath = path.join(tmpDir, 'custom-config.json');
      fs.writeFileSync(
        customConfigPath,
        JSON.stringify({
          build: {
            production: {
              ios: {
                scheme: 'MyApp',
                buildConfiguration: 'Release-Production',
                exportMethod: 'app-store',
              },
            },
          },
        }),
      );

      const result = await parseConfigFile(customConfigPath);
      expect(result.build?.production?.ios?.buildConfiguration).toBe('Release-Production');

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('throws for invalid export method enum value', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badPath = path.join(tmpDir, 'bad-export.json');
      fs.writeFileSync(
        badPath,
        JSON.stringify({
          build: {
            production: {
              ios: {
                scheme: 'MyApp',
                buildConfiguration: 'Release',
                exportMethod: 'not-valid',
              },
            },
          },
        }),
      );

      await expect(parseConfigFile(badPath)).rejects.toThrow(/Invalid config/);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('throws for invalid android build type', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badPath = path.join(tmpDir, 'bad-android.json');
      fs.writeFileSync(
        badPath,
        JSON.stringify({
          build: {
            production: {
              android: {
                buildType: 'staging',
              },
            },
          },
        }),
      );

      await expect(parseConfigFile(badPath)).rejects.toThrow(/Invalid config/);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('throws for invalid submit track', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badPath = path.join(tmpDir, 'bad-track.json');
      fs.writeFileSync(
        badPath,
        JSON.stringify({
          build: { production: { android: { buildType: 'release' } } },
          submit: {
            android: {
              packageName: 'com.example.app',
              track: 'nightly',
            },
          },
        }),
      );

      await expect(parseConfigFile(badPath)).rejects.toThrow(/Invalid config/);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('throws for missing required field in ios build config', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badPath = path.join(tmpDir, 'missing-scheme.json');
      fs.writeFileSync(
        badPath,
        JSON.stringify({
          build: {
            production: {
              ios: {
                buildConfiguration: 'Release',
                exportMethod: 'app-store',
                // scheme is missing
              },
            },
          },
        }),
      );

      await expect(parseConfigFile(badPath)).rejects.toThrow(/Invalid config/);

      fs.rmSync(tmpDir, { recursive: true });
    });

    it('provides field-level error paths in the error message', async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-test-'));
      const badPath = path.join(tmpDir, 'field-error.json');
      fs.writeFileSync(
        badPath,
        JSON.stringify({
          build: {
            production: {
              ios: {
                scheme: 123,
                buildConfiguration: 'Release',
                exportMethod: 'app-store',
              },
            },
          },
        }),
      );

      try {
        await parseConfigFile(badPath);
        fail('Expected parseConfigFile to throw');
      } catch (err) {
        const message = (err as Error).message;
        // The error should mention the path to the invalid field
        expect(message).toContain('build.production.ios.scheme');
      }

      fs.rmSync(tmpDir, { recursive: true });
    });
  });
});

// ---------------------------------------------------------------------------
// getProfileConfig
// ---------------------------------------------------------------------------

describe('getProfileConfig', () => {
  const fullConfig: AppBuildConfig = {
    build: {
      development: {
        ios: { scheme: 'MyApp', buildConfiguration: 'Debug', exportMethod: 'development' },
        android: { buildType: 'debug' },
      },
      production: {
        ios: { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        android: { buildType: 'release', aab: true },
      },
      'ios-only': {
        ios: { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'ad-hoc' },
      },
      'android-only': {
        android: { buildType: 'release' },
      },
    },
  };

  it('extracts iOS config from a profile', () => {
    const iosConfig = getProfileConfig(fullConfig, 'production', 'ios');
    expect(iosConfig).toEqual({
      scheme: 'MyApp',
      buildConfiguration: 'Release',
      exportMethod: 'app-store',
    });
  });

  it('extracts Android config from a profile', () => {
    const androidConfig = getProfileConfig(fullConfig, 'production', 'android');
    expect(androidConfig).toEqual({
      buildType: 'release',
      aab: true,
    });
  });

  it('throws when profile does not exist', () => {
    expect(() => getProfileConfig(fullConfig, 'staging', 'ios')).toThrow(
      /Build profile "staging" not found/,
    );
  });

  it('lists available profiles in the error message', () => {
    expect(() => getProfileConfig(fullConfig, 'staging', 'ios')).toThrow(
      /development, production, ios-only, android-only/,
    );
  });

  it('throws when platform is not configured in the profile', () => {
    expect(() => getProfileConfig(fullConfig, 'ios-only', 'android')).toThrow(
      /Platform "android" is not configured in profile "ios-only"/,
    );
  });

  it('lists configured platforms in the error message', () => {
    expect(() => getProfileConfig(fullConfig, 'ios-only', 'android')).toThrow(
      /Configured platforms: ios/,
    );
  });

  it('reports "none" when profile has no platforms', () => {
    const emptyProfile: AppBuildConfig = {
      build: { empty: {} },
    };
    expect(() => getProfileConfig(emptyProfile, 'empty', 'ios')).toThrow(
      /Configured platforms: none/,
    );
  });
});

// ---------------------------------------------------------------------------
// mergeActionInputs
// ---------------------------------------------------------------------------

describe('mergeActionInputs', () => {
  const config: AppBuildConfig = {
    build: {
      production: {
        ios: { scheme: 'MyApp', buildConfiguration: 'Release', exportMethod: 'app-store' },
        android: { buildType: 'release', aab: true },
      },
      development: {
        ios: { scheme: 'MyApp', buildConfiguration: 'Debug', exportMethod: 'development' },
        android: { buildType: 'debug' },
      },
    },
    submit: {
      ios: { ascAppId: '1234567890' },
      android: { packageName: 'com.example.app', track: 'internal' },
    },
    signing: {
      ios: { method: 'manual' },
      android: { method: 'manual' },
    },
    updates: {
      enabled: true,
      url: 'https://updates.example.com',
      storage: { type: 's3', bucket: 'my-bucket', region: 'us-east-1' },
    },
    version: {
      autoIncrement: true,
    },
  };

  const baseInputs: ActionInputs = {
    platform: 'ios',
    profile: 'production',
    submit: true,
    ota: false,
    versionBump: true,
    cache: true,
    fingerprint: false,
    skipPrebuild: false,
    prebuildClean: false,
    nodeVersion: '20',
    fastlaneVersion: 'latest',
    iosCertificateP12: 'base64cert',
    iosCertificatePassword: 'certpass',
    ascApiKeyId: 'KEY123',
    ascApiIssuerId: 'ISSUER456',
    ascApiKeyP8: 'base64p8',
  };

  it('produces a ResolvedConfig for iOS', () => {
    const resolved = mergeActionInputs(config, baseInputs);

    expect(resolved.platform).toBe('ios');
    expect(resolved.profile).toBe('production');
    expect(resolved.submit).toBe(true);
    expect(resolved.ota).toBe(false);
    expect(resolved.versionBump).toBe(true);
    expect(resolved.cache).toBe(true);
    expect(resolved.nodeVersion).toBe('20');
    expect(resolved.fastlaneVersion).toBe('latest');

    expect(resolved.ios).toEqual({
      scheme: 'MyApp',
      buildConfiguration: 'Release',
      exportMethod: 'app-store',
    });
    expect(resolved.android).toBeUndefined();
  });

  it('produces a ResolvedConfig for Android', () => {
    const androidInputs: ActionInputs = {
      ...baseInputs,
      platform: 'android',
      androidKeystore: 'base64ks',
      androidKeystorePassword: 'kspass',
      androidKeyAlias: 'mykey',
      androidKeyPassword: 'keypass',
      googlePlayServiceAccount: 'base64sa',
    };

    const resolved = mergeActionInputs(config, androidInputs);

    expect(resolved.platform).toBe('android');
    expect(resolved.android).toEqual({ buildType: 'release', aab: true });
    expect(resolved.ios).toBeUndefined();
  });

  it('passes through credentials', () => {
    const resolved = mergeActionInputs(config, baseInputs);

    expect(resolved.credentials.iosCertificateP12).toBe('base64cert');
    expect(resolved.credentials.iosCertificatePassword).toBe('certpass');
    expect(resolved.credentials.ascApiKeyId).toBe('KEY123');
    expect(resolved.credentials.ascApiIssuerId).toBe('ISSUER456');
    expect(resolved.credentials.ascApiKeyP8).toBe('base64p8');
  });

  it('passes through config sections (submit, signing, updates, version)', () => {
    const resolved = mergeActionInputs(config, baseInputs);

    expect(resolved.submitConfig?.ios?.ascAppId).toBe('1234567890');
    expect(resolved.signingConfig?.ios).toEqual({ method: 'manual' });
    expect(resolved.updatesConfig?.enabled).toBe(true);
    expect(resolved.updatesConfig?.storage?.type).toBe('s3');
    expect(resolved.versionConfig?.autoIncrement).toBe(true);
  });

  it('defaults version.source to "app.json" when not specified in config', () => {
    const resolved = mergeActionInputs(config, baseInputs);
    expect(resolved.versionConfig?.source).toBe('app.json');
  });

  it('preserves explicit version.source from config', () => {
    const configWithSource: AppBuildConfig = {
      ...config,
      version: { autoIncrement: false, source: 'package.json' },
    };
    const resolved = mergeActionInputs(configWithSource, baseInputs);
    expect(resolved.versionConfig?.source).toBe('package.json');
  });

  it('defaults to "production" profile when inputs.profile is empty', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      profile: '',
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.profile).toBe('production');
  });

  it('uses the development profile when specified', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      profile: 'development',
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.profile).toBe('development');
    expect(resolved.ios).toEqual({
      scheme: 'MyApp',
      buildConfiguration: 'Debug',
      exportMethod: 'development',
    });
  });

  it('throws when the requested profile does not exist', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      profile: 'staging',
    };
    expect(() => mergeActionInputs(config, inputs)).toThrow(
      /Build profile "staging" not found/,
    );
  });

  it('defaults nodeVersion when input is empty string', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      nodeVersion: '',
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.nodeVersion).toBe('20');
  });

  it('defaults fastlaneVersion when input is empty string', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      fastlaneVersion: '',
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.fastlaneVersion).toBe('latest');
  });

  it('passes through skipPrebuild flag', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      skipPrebuild: true,
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.skipPrebuild).toBe(true);
  });

  it('passes through prebuildClean flag', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      prebuildClean: true,
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.prebuildClean).toBe(true);
  });

  it('defaults skipPrebuild and prebuildClean to false', () => {
    const resolved = mergeActionInputs(config, baseInputs);
    expect(resolved.skipPrebuild).toBe(false);
    expect(resolved.prebuildClean).toBe(false);
  });

  it('overrides iOS scheme and buildConfiguration from action inputs', () => {
    const inputs: ActionInputs = {
      ...baseInputs,
      iosScheme: 'MyApp-Production',
      iosBuildConfiguration: 'Release-Production',
    };
    const resolved = mergeActionInputs(config, inputs);
    expect(resolved.ios?.scheme).toBe('MyApp-Production');
    expect(resolved.ios?.buildConfiguration).toBe('Release-Production');
    // exportMethod should remain from config
    expect(resolved.ios?.exportMethod).toBe('app-store');
  });

  it('does not override iOS scheme/config when action inputs are absent', () => {
    const resolved = mergeActionInputs(config, baseInputs);
    expect(resolved.ios?.scheme).toBe('MyApp');
    expect(resolved.ios?.buildConfiguration).toBe('Release');
  });
});
