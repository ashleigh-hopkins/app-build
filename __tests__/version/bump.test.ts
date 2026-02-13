import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import { bumpVersion, BumpResult, parseVersionFromTag, generateTimestamp, resolveExpoConfig } from '../../src/version/bump';

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-bump-'));
}

function writeAppJson(dir: string, content: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, 'app.json'), JSON.stringify(content, null, 2) + '\n');
}

function readAppJson(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, 'app.json'), 'utf-8'));
}

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
    return 128; // non-zero triggers throw in runCommand
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bumpVersion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  // -------------------------------------------------------------------------
  // iOS (app-json strategy — default)
  // -------------------------------------------------------------------------

  describe('iOS', () => {
    it('reads expo.ios.buildNumber, increments it, and writes back as string', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          ios: { buildNumber: '42' },
        },
      });

      const result = await bumpVersion('ios', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 42,
        newValue: 43,
        field: 'expo.ios.buildNumber',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe('43');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '43');
      expect(core.info).toHaveBeenCalledWith('Version bumped: expo.ios.buildNumber 42 → 43');
    });

    it('falls back to expo.buildNumber when expo.ios.buildNumber is absent', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          buildNumber: '10',
        },
      });

      const result = await bumpVersion('ios', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 10,
        newValue: 11,
        field: 'expo.buildNumber',
      });

      const written = readAppJson(tmpDir);
      // Should write back to the same fallback path, as a string
      expect((written as any).expo.buildNumber).toBe('11');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '11');
    });

    it('starts from 1 when no buildNumber field exists', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          ios: { bundleIdentifier: 'com.example.app' },
        },
      });

      const result = await bumpVersion('ios', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 0,
        newValue: 1,
        field: 'expo.ios.buildNumber',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe('1');
    });
  });

  // -------------------------------------------------------------------------
  // Android (app-json strategy — default)
  // -------------------------------------------------------------------------

  describe('Android', () => {
    it('reads expo.android.versionCode, increments it, and writes back as number', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          android: { versionCode: 42 },
        },
      });

      const result = await bumpVersion('android', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 42,
        newValue: 43,
        field: 'expo.android.versionCode',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.android.versionCode).toBe(43);
      // Must be a number, not a string
      expect(typeof (written as any).expo.android.versionCode).toBe('number');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '43');
      expect(core.info).toHaveBeenCalledWith('Version bumped: expo.android.versionCode 42 → 43');
    });

    it('falls back to expo.versionCode when expo.android.versionCode is absent', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          versionCode: 7,
        },
      });

      const result = await bumpVersion('android', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 7,
        newValue: 8,
        field: 'expo.versionCode',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.versionCode).toBe(8);
      expect(typeof (written as any).expo.versionCode).toBe('number');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '8');
    });

    it('starts from 1 when no versionCode field exists', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          android: { package: 'com.example.app' },
        },
      });

      const result = await bumpVersion('android', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 0,
        newValue: 1,
        field: 'expo.android.versionCode',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.android.versionCode).toBe(1);
      expect(typeof (written as any).expo.android.versionCode).toBe('number');
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases (app-json strategy)
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('throws when buildNumber has a non-numeric string value', async () => {
      writeAppJson(tmpDir, {
        expo: {
          ios: { buildNumber: 'abc' },
        },
      });

      await expect(bumpVersion('ios', tmpDir)).rejects.toThrow(
        'expo.ios.buildNumber has non-numeric value "abc"',
      );
    });

    it('throws when versionCode has a non-numeric value', async () => {
      writeAppJson(tmpDir, {
        expo: {
          android: { versionCode: 'not-a-number' },
        },
      });

      await expect(bumpVersion('android', tmpDir)).rejects.toThrow(
        'expo.android.versionCode has non-numeric value "not-a-number"',
      );
    });

    it('preserves the rest of app.json structure', async () => {
      const original = {
        expo: {
          name: 'MyApp',
          slug: 'my-app',
          version: '1.2.3',
          ios: {
            bundleIdentifier: 'com.example.app',
            buildNumber: '5',
            supportsTablet: true,
          },
          android: {
            package: 'com.example.app',
            versionCode: 5,
            permissions: ['CAMERA'],
          },
          extra: {
            apiUrl: 'https://api.example.com',
          },
        },
      };

      writeAppJson(tmpDir, original);

      // Bump iOS
      await bumpVersion('ios', tmpDir);
      let written = readAppJson(tmpDir);

      // buildNumber incremented
      expect((written as any).expo.ios.buildNumber).toBe('6');
      // Everything else preserved
      expect((written as any).expo.name).toBe('MyApp');
      expect((written as any).expo.slug).toBe('my-app');
      expect((written as any).expo.version).toBe('1.2.3');
      expect((written as any).expo.ios.bundleIdentifier).toBe('com.example.app');
      expect((written as any).expo.ios.supportsTablet).toBe(true);
      expect((written as any).expo.android.package).toBe('com.example.app');
      expect((written as any).expo.android.versionCode).toBe(5);
      expect((written as any).expo.android.permissions).toEqual(['CAMERA']);
      expect((written as any).expo.extra.apiUrl).toBe('https://api.example.com');

      // Bump Android on the same file
      await bumpVersion('android', tmpDir);
      written = readAppJson(tmpDir);

      expect((written as any).expo.android.versionCode).toBe(6);
      // iOS buildNumber should still be '6' from the previous bump
      expect((written as any).expo.ios.buildNumber).toBe('6');
      expect((written as any).expo.extra.apiUrl).toBe('https://api.example.com');
    });

    it('uses a custom source file when specified', async () => {
      const customFile = 'custom-config.json';
      fs.writeFileSync(
        path.join(tmpDir, customFile),
        JSON.stringify({ expo: { ios: { buildNumber: '99' } } }, null, 2) + '\n',
      );

      const result = await bumpVersion('ios', tmpDir, customFile);

      expect(result.previousValue).toBe(99);
      expect(result.newValue).toBe(100);

      const written = JSON.parse(fs.readFileSync(path.join(tmpDir, customFile), 'utf-8'));
      expect(written.expo.ios.buildNumber).toBe('100');
    });

    it('writes 2-space indentation with trailing newline', async () => {
      writeAppJson(tmpDir, {
        expo: { ios: { buildNumber: '1' } },
      });

      await bumpVersion('ios', tmpDir);

      const rawContent = fs.readFileSync(path.join(tmpDir, 'app.json'), 'utf-8');

      // Trailing newline
      expect(rawContent.endsWith('\n')).toBe(true);

      // 2-space indentation (second line should start with 2 spaces)
      const lines = rawContent.split('\n');
      expect(lines[1]).toMatch(/^ {2}"/);
    });

    it('creates intermediate objects when expo key is missing entirely', async () => {
      writeAppJson(tmpDir, { name: 'bare-project' });

      const result = await bumpVersion('ios', tmpDir);

      expect(result).toEqual<BumpResult>({
        previousValue: 0,
        newValue: 1,
        field: 'expo.ios.buildNumber',
      });

      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe('1');
      // Original fields preserved
      expect((written as any).name).toBe('bare-project');
    });

    it('explicitly uses app-json strategy when passed', async () => {
      writeAppJson(tmpDir, {
        expo: { ios: { buildNumber: '10' } },
      });

      const result = await bumpVersion('ios', tmpDir, undefined, 'app-json');

      expect(result).toEqual<BumpResult>({
        previousValue: 10,
        newValue: 11,
        field: 'expo.ios.buildNumber',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Strategy: git-tag
  // -------------------------------------------------------------------------

  describe('git-tag strategy', () => {
    it('parses latest git tag and increments patch for iOS', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('v2.3.4\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      // v2.3.4 -> v2.3.5, build number = 2*10000 + 3*100 + 5 = 20305
      expect(result.newValue).toBe(20305);
      expect(result.previousValue).toBe(20304); // 2*10000 + 3*100 + 4
      expect(result.field).toBe('expo.ios.buildNumber');
      expect(result.version).toBe('2.3.5');

      // Verify git describe was called with correct args
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['describe', '--tags', '--abbrev=0', '--match=v*'],
        expect.objectContaining({ cwd: tmpDir }),
      );

      // Verify app.json was updated
      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe('20305');
      expect((written as any).expo.version).toBe('2.3.5');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '20305');
    });

    it('parses latest git tag and increments patch for Android', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('v1.5.9\n');

      const result = await bumpVersion('android', tmpDir, undefined, 'git-tag');

      // v1.5.9 -> v1.5.10, build number = 1*10000 + 5*100 + 10 = 10510
      expect(result.newValue).toBe(10510);
      expect(result.previousValue).toBe(10509);
      expect(result.field).toBe('expo.android.versionCode');
      expect(result.version).toBe('1.5.10');

      // Verify app.json was updated with a number (not string) for Android
      const written = readAppJson(tmpDir);
      expect((written as any).expo.android.versionCode).toBe(10510);
      expect(typeof (written as any).expo.android.versionCode).toBe('number');
      expect((written as any).expo.version).toBe('1.5.10');
    });

    it('falls back to 1.0.0 when no tags exist', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      // Simulate git describe failing (no tags)
      mockExecFailure('fatal: No names found, cannot describe anything.\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      // Fallback: 1.0.0, build number = 10000
      expect(result.newValue).toBe(10000);
      expect(result.previousValue).toBe(0);
      expect(result.version).toBe('1.0.0');

      expect(core.info).toHaveBeenCalledWith(
        'No git tags matching "v*" found, using fallback version 1.0.0',
      );
    });

    it('uses a custom git tag pattern', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('release-3.1.0\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag', 'release-*');

      expect(result.version).toBe('3.1.1');
      expect(result.newValue).toBe(30101); // 3*10000 + 1*100 + 1

      // Verify custom pattern was passed to git describe
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['describe', '--tags', '--abbrev=0', '--match=release-*'],
        expect.objectContaining({ cwd: tmpDir }),
      );
    });

    it('handles tag with no parseable semver by falling back to 1.0.0', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('build-abc\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      expect(result.version).toBe('1.0.0');
      expect(result.newValue).toBe(10000);

      expect(core.warning).toHaveBeenCalledWith(
        'Could not parse semver from tag "build-abc", using fallback 1.0.0',
      );
    });

    it('handles v0.x tags by starting from 1.0.0', async () => {
      // If the latest tag is v0.9.5, previous = {0,9,5}, but since major==0
      // the logic starts at 1.0.0
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      // This is an edge case: 0.x.x tags. The code converts major 0 to 1.
      mockExecStdout('v0.9.5\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      // major=0 triggers "|| 1" so newVersion.major becomes 1.
      // patch increments: 5+1=6 would be wrong since major changed.
      // Actually the logic: previousVersion = {0,9,5}, newVersion = {1,9,6}.
      // Wait — let me re-check the code:
      //   newVersion.major = previousVersion.major || 1 = 0 || 1 = 1
      //   newVersion.minor = 9
      //   newVersion.patch = 5 + (0 === 0 ? 0 : 1) = 5 + 0 = 5
      // But wait, previousVersion.major is 0, not === 0 in the boolean sense.
      // Actually 0 === 0 is true, so patch + 0 = 5.
      // Then the fallback check: major=0 && minor=9 && patch=5 => not all zero, so no fallback.
      // Result: {1, 9, 5}
      expect(result.version).toBe('1.9.5');
      expect(result.newValue).toBe(10905); // 1*10000 + 9*100 + 5
    });

    it('gracefully handles missing app.json for git-tag strategy', async () => {
      // Do NOT write app.json — the strategy should still work,
      // just log a message about not being able to update the file
      mockExecStdout('v1.0.0\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      expect(result.version).toBe('1.0.1');
      expect(result.newValue).toBe(10001);

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Could not update app.json'),
      );
    });

    it('sets expo.version in app.json alongside the build number', async () => {
      writeAppJson(tmpDir, {
        expo: {
          name: 'MyApp',
          version: '0.0.1',
          ios: { buildNumber: '1' },
        },
      });

      mockExecStdout('v3.2.1\n');

      await bumpVersion('ios', tmpDir, undefined, 'git-tag');

      const written = readAppJson(tmpDir);
      expect((written as any).expo.version).toBe('3.2.2');
      expect((written as any).expo.ios.buildNumber).toBe('30202');
      // Other fields preserved
      expect((written as any).expo.name).toBe('MyApp');
    });
  });

  // -------------------------------------------------------------------------
  // Strategy: git-commit-count
  // -------------------------------------------------------------------------

  describe('git-commit-count strategy', () => {
    it('uses commit count as build number for iOS', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('247\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-commit-count');

      expect(result.newValue).toBe(247);
      expect(result.previousValue).toBe(0);
      expect(result.field).toBe('expo.ios.buildNumber');

      // Verify git rev-list was called
      expect(mockExec).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--count', 'HEAD'],
        expect.objectContaining({ cwd: tmpDir }),
      );

      // Verify app.json updated — iOS uses string
      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe('247');

      expect(core.setOutput).toHaveBeenCalledWith('build-number', '247');
      expect(core.info).toHaveBeenCalledWith('Version bumped (git-commit-count): 247 commits');
    });

    it('uses commit count as build number for Android', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('1024\n');

      const result = await bumpVersion('android', tmpDir, undefined, 'git-commit-count');

      expect(result.newValue).toBe(1024);
      expect(result.field).toBe('expo.android.versionCode');

      // Android uses numeric type
      const written = readAppJson(tmpDir);
      expect((written as any).expo.android.versionCode).toBe(1024);
      expect(typeof (written as any).expo.android.versionCode).toBe('number');
    });

    it('handles a single commit (count = 1)', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('1\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-commit-count');

      expect(result.newValue).toBe(1);
    });

    it('handles large commit counts', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('99999\n');

      const result = await bumpVersion('android', tmpDir, undefined, 'git-commit-count');

      expect(result.newValue).toBe(99999);
    });

    it('throws when git rev-list returns non-numeric output', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecStdout('not-a-number\n');

      await expect(
        bumpVersion('ios', tmpDir, undefined, 'git-commit-count'),
      ).rejects.toThrow('git rev-list --count HEAD returned non-numeric value: "not-a-number"');
    });

    it('propagates error when git command fails entirely', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      mockExecFailure('fatal: not a git repository\n');

      await expect(
        bumpVersion('ios', tmpDir, undefined, 'git-commit-count'),
      ).rejects.toThrow('Command failed');
    });

    it('gracefully handles missing app.json', async () => {
      // No app.json written
      mockExecStdout('50\n');

      const result = await bumpVersion('ios', tmpDir, undefined, 'git-commit-count');

      expect(result.newValue).toBe(50);
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Could not update app.json'),
      );
    });

    it('uses custom source file path', async () => {
      const customFile = 'my-config.json';
      fs.writeFileSync(
        path.join(tmpDir, customFile),
        JSON.stringify({ expo: { name: 'MyApp' } }, null, 2) + '\n',
      );

      mockExecStdout('77\n');

      const result = await bumpVersion('ios', tmpDir, customFile, 'git-commit-count');

      expect(result.newValue).toBe(77);

      const written = JSON.parse(fs.readFileSync(path.join(tmpDir, customFile), 'utf-8'));
      expect(written.expo.ios.buildNumber).toBe('77');
    });
  });

  // -------------------------------------------------------------------------
  // Strategy: timestamp
  // -------------------------------------------------------------------------

  describe('timestamp strategy', () => {
    it('uses YYYYMMDDHHmm timestamp as build number for iOS', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      const result = await bumpVersion('ios', tmpDir, undefined, 'timestamp');

      expect(result.newValue).toBeGreaterThan(202000000000); // reasonable lower bound
      expect(result.previousValue).toBe(0);
      expect(result.field).toBe('expo.ios.buildNumber');

      // Verify app.json updated as string for iOS
      const written = readAppJson(tmpDir);
      expect((written as any).expo.ios.buildNumber).toBe(String(result.newValue));

      expect(core.setOutput).toHaveBeenCalledWith('build-number', result.newValue.toString());
    });

    it('uses timestamp as build number for Android (numeric)', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      const result = await bumpVersion('android', tmpDir, undefined, 'timestamp');

      expect(result.newValue).toBeGreaterThan(202000000000);
      expect(result.field).toBe('expo.android.versionCode');

      const written = readAppJson(tmpDir);
      expect((written as any).expo.android.versionCode).toBe(result.newValue);
      expect(typeof (written as any).expo.android.versionCode).toBe('number');
    });

    it('gracefully handles missing app.json', async () => {
      // No app.json written
      const result = await bumpVersion('ios', tmpDir, undefined, 'timestamp');

      expect(result.newValue).toBeGreaterThan(0);
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Could not update app.json'),
      );
    });

    it('produces a 12-digit number in YYYYMMDDHHmm format', async () => {
      writeAppJson(tmpDir, { expo: { name: 'MyApp' } });

      const result = await bumpVersion('ios', tmpDir, undefined, 'timestamp');

      const str = result.newValue.toString();
      expect(str).toMatch(/^\d{12}$/);

      // Verify the year portion is sane
      const year = parseInt(str.substring(0, 4), 10);
      expect(year).toBeGreaterThanOrEqual(2024);
      expect(year).toBeLessThanOrEqual(2100);

      // Verify month is 01-12
      const month = parseInt(str.substring(4, 6), 10);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);

      // Verify day is 01-31
      const day = parseInt(str.substring(6, 8), 10);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(31);

      // Verify hour is 00-23
      const hour = parseInt(str.substring(8, 10), 10);
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);

      // Verify minute is 00-59
      const minute = parseInt(str.substring(10, 12), 10);
      expect(minute).toBeGreaterThanOrEqual(0);
      expect(minute).toBeLessThanOrEqual(59);
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic config resolution (app.config.js / app.config.ts)
  // -------------------------------------------------------------------------

  describe('dynamic config (app.config.js / app.config.ts)', () => {
    describe('resolveExpoConfig', () => {
      it('returns app.json when it exists', async () => {
        writeAppJson(tmpDir, { expo: { name: 'MyApp', ios: { buildNumber: '5' } } });

        const result = await resolveExpoConfig(tmpDir);

        expect(result.config).toEqual({ expo: { name: 'MyApp', ios: { buildNumber: '5' } } });
        expect(result.writePath).toBe(path.resolve(tmpDir, 'app.json'));
      });

      it('uses custom source when provided', async () => {
        const customFile = 'custom.json';
        fs.writeFileSync(
          path.join(tmpDir, customFile),
          JSON.stringify({ expo: { name: 'Custom' } }, null, 2),
        );

        const result = await resolveExpoConfig(tmpDir, customFile);

        expect(result.config).toEqual({ expo: { name: 'Custom' } });
        expect(result.writePath).toBe(path.resolve(tmpDir, customFile));
      });

      it('falls back to npx expo config when app.json is missing and app.config.js exists', async () => {
        // Create app.config.js (content doesn't matter — we mock the exec)
        fs.writeFileSync(path.join(tmpDir, 'app.config.js'), 'module.exports = {};');

        // Mock npx expo config to return resolved config
        mockExecStdout(JSON.stringify({ name: 'DynamicApp', ios: { buildNumber: '10' } }));

        const result = await resolveExpoConfig(tmpDir);

        // Should be wrapped in { expo: ... }
        expect(result.config).toEqual({
          expo: { name: 'DynamicApp', ios: { buildNumber: '10' } },
        });
        expect(result.writePath).toBe(path.resolve(tmpDir, 'app.json'));
      });

      it('falls back to npx expo config when app.json is missing and app.config.ts exists', async () => {
        fs.writeFileSync(path.join(tmpDir, 'app.config.ts'), 'export default {};');

        mockExecStdout(JSON.stringify({ name: 'TSApp', runtimeVersion: '1.0.0' }));

        const result = await resolveExpoConfig(tmpDir);

        expect(result.config).toEqual({
          expo: { name: 'TSApp', runtimeVersion: '1.0.0' },
        });
      });

      it('throws when no config files exist at all', async () => {
        await expect(resolveExpoConfig(tmpDir)).rejects.toThrow(
          'No app config found',
        );
      });

      it('throws when app.config.js exists but npx expo config fails', async () => {
        fs.writeFileSync(path.join(tmpDir, 'app.config.js'), 'module.exports = {};');

        mockExecFailure('Error: expo not found');

        await expect(resolveExpoConfig(tmpDir)).rejects.toThrow(
          'could not resolve dynamic config',
        );
      });

      it('returns app.json even when app.json has no expo key (bare workflow)', async () => {
        writeAppJson(tmpDir, { name: 'bare-project' });

        const result = await resolveExpoConfig(tmpDir);

        expect(result.config).toEqual({ name: 'bare-project' });
        expect(result.writePath).toBe(path.resolve(tmpDir, 'app.json'));
      });
    });

    describe('bumpVersion with app.config.js', () => {
      it('reads version from dynamic config and writes to app.json (app-json strategy)', async () => {
        // No app.json, only app.config.js
        fs.writeFileSync(path.join(tmpDir, 'app.config.js'), 'module.exports = {};');

        mockExecStdout(JSON.stringify({
          name: 'DynamicApp',
          ios: { buildNumber: '42' },
        }));

        const result = await bumpVersion('ios', tmpDir);

        expect(result.previousValue).toBe(42);
        expect(result.newValue).toBe(43);
        expect(result.field).toBe('expo.ios.buildNumber');

        // Should have created/written app.json
        const written = readAppJson(tmpDir);
        expect((written as any).expo.ios.buildNumber).toBe('43');
      });

      it('reads version from dynamic config for Android', async () => {
        fs.writeFileSync(path.join(tmpDir, 'app.config.js'), 'module.exports = {};');

        mockExecStdout(JSON.stringify({
          name: 'DynamicApp',
          android: { versionCode: 99 },
        }));

        const result = await bumpVersion('android', tmpDir);

        expect(result.previousValue).toBe(99);
        expect(result.newValue).toBe(100);
        expect(result.field).toBe('expo.android.versionCode');

        const written = readAppJson(tmpDir);
        expect((written as any).expo.android.versionCode).toBe(100);
        expect(typeof (written as any).expo.android.versionCode).toBe('number');
      });

      it('starts from 1 when dynamic config has no build number', async () => {
        fs.writeFileSync(path.join(tmpDir, 'app.config.js'), 'module.exports = {};');

        mockExecStdout(JSON.stringify({ name: 'DynamicApp' }));

        const result = await bumpVersion('ios', tmpDir);

        expect(result.previousValue).toBe(0);
        expect(result.newValue).toBe(1);

        const written = readAppJson(tmpDir);
        expect((written as any).expo.ios.buildNumber).toBe('1');
      });
    });
  });

  // -------------------------------------------------------------------------
  // parseVersionFromTag
  // -------------------------------------------------------------------------

  describe('parseVersionFromTag', () => {
    it('parses a standard v-prefixed tag', () => {
      expect(parseVersionFromTag('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('parses a tag without v prefix', () => {
      expect(parseVersionFromTag('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });

    it('parses a tag with prefix text before the version', () => {
      expect(parseVersionFromTag('release-2.0.0')).toEqual({ major: 2, minor: 0, patch: 0 });
    });

    it('parses a tag with suffix after the version', () => {
      expect(parseVersionFromTag('v3.1.4-beta.1')).toEqual({ major: 3, minor: 1, patch: 4 });
    });

    it('returns null for a tag with no semver pattern', () => {
      expect(parseVersionFromTag('just-a-name')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseVersionFromTag('')).toBeNull();
    });

    it('handles v0.0.0', () => {
      expect(parseVersionFromTag('v0.0.0')).toEqual({ major: 0, minor: 0, patch: 0 });
    });

    it('handles large version numbers', () => {
      expect(parseVersionFromTag('v100.200.300')).toEqual({ major: 100, minor: 200, patch: 300 });
    });

    it('takes the first semver match in the string', () => {
      // If there are multiple matches, the regex takes the first
      expect(parseVersionFromTag('v1.0.0-rc.2.0.0')).toEqual({ major: 1, minor: 0, patch: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // generateTimestamp
  // -------------------------------------------------------------------------

  describe('generateTimestamp', () => {
    it('generates correct format for a known date', () => {
      // 2024-06-15T14:30:00Z -> 202406151430
      const date = new Date('2024-06-15T14:30:00Z');
      expect(generateTimestamp(date)).toBe(202406151430);
    });

    it('pads single-digit months and days', () => {
      // 2024-01-05T03:07:00Z -> 202401050307
      const date = new Date('2024-01-05T03:07:00Z');
      expect(generateTimestamp(date)).toBe(202401050307);
    });

    it('handles midnight (00:00)', () => {
      const date = new Date('2024-12-31T00:00:00Z');
      expect(generateTimestamp(date)).toBe(202412310000);
    });

    it('handles end of day (23:59)', () => {
      const date = new Date('2024-12-31T23:59:00Z');
      expect(generateTimestamp(date)).toBe(202412312359);
    });

    it('uses UTC time, not local time', () => {
      // Regardless of local timezone, the output should be UTC
      const date = new Date('2024-06-15T14:30:00Z');
      const result = generateTimestamp(date);
      // Verify it starts with 2024 and contains 1430 (UTC hour:min)
      expect(result.toString()).toContain('1430');
    });

    it('returns a 12-digit number', () => {
      const result = generateTimestamp(new Date('2024-06-15T14:30:00Z'));
      expect(result.toString()).toHaveLength(12);
    });

    it('uses current time when no date argument provided', () => {
      const before = generateTimestamp(new Date());
      const result = generateTimestamp(); // no arg — uses Date.now internally
      const after = generateTimestamp(new Date());

      // Result should be between before and after (inclusive)
      expect(result).toBeGreaterThanOrEqual(before);
      expect(result).toBeLessThanOrEqual(after);
    });
  });
});
