import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import {
  listInstalledXcodeVersions,
  findBestXcodeMatch,
  selectXcodeVersion,
} from '../../src/setup/xcode';

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

/**
 * Create a temp directory with fake Xcode apps.
 */
function makeFakeApplicationsDir(xcodeVersions: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-xcode-test-'));
  for (const version of xcodeVersions) {
    fs.mkdirSync(path.join(dir, `Xcode_${version}.app`));
  }
  return dir;
}

describe('setup/xcode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // listInstalledXcodeVersions
  // -----------------------------------------------------------------------

  describe('listInstalledXcodeVersions', () => {
    it('returns all Xcode versions from the directory, sorted descending', () => {
      const dir = makeFakeApplicationsDir(['15.4', '16.0', '16.2', '26']);

      const result = listInstalledXcodeVersions(dir);

      expect(result).toEqual([
        { version: '26', appPath: `${dir}/Xcode_26.app` },
        { version: '16.2', appPath: `${dir}/Xcode_16.2.app` },
        { version: '16.0', appPath: `${dir}/Xcode_16.0.app` },
        { version: '15.4', appPath: `${dir}/Xcode_15.4.app` },
      ]);

      fs.rmSync(dir, { recursive: true });
    });

    it('ignores non-Xcode directories and files', () => {
      const dir = makeFakeApplicationsDir(['16.2']);
      // Add some non-Xcode entries
      fs.mkdirSync(path.join(dir, 'Safari.app'));
      fs.mkdirSync(path.join(dir, 'Xcode.app'));
      fs.writeFileSync(path.join(dir, 'some-file.txt'), '');

      const result = listInstalledXcodeVersions(dir);

      expect(result).toEqual([
        { version: '16.2', appPath: `${dir}/Xcode_16.2.app` },
      ]);

      fs.rmSync(dir, { recursive: true });
    });

    it('returns empty array when no Xcode versions found', () => {
      const dir = makeFakeApplicationsDir([]);
      fs.mkdirSync(path.join(dir, 'Safari.app'));

      const result = listInstalledXcodeVersions(dir);

      expect(result).toEqual([]);

      fs.rmSync(dir, { recursive: true });
    });

    it('returns empty array when directory does not exist', () => {
      const result = listInstalledXcodeVersions('/nonexistent/path');

      expect(result).toEqual([]);
    });

    it('handles single-segment versions like "26"', () => {
      const dir = makeFakeApplicationsDir(['26']);

      const result = listInstalledXcodeVersions(dir);

      expect(result).toEqual([
        { version: '26', appPath: `${dir}/Xcode_26.app` },
      ]);

      fs.rmSync(dir, { recursive: true });
    });
  });

  // -----------------------------------------------------------------------
  // findBestXcodeMatch
  // -----------------------------------------------------------------------

  describe('findBestXcodeMatch', () => {
    const installed = [
      { version: '26', appPath: '/Applications/Xcode_26.app' },
      { version: '16.2', appPath: '/Applications/Xcode_16.2.app' },
      { version: '16.1', appPath: '/Applications/Xcode_16.1.app' },
      { version: '16.0', appPath: '/Applications/Xcode_16.0.app' },
      { version: '15.4', appPath: '/Applications/Xcode_15.4.app' },
    ];

    it('returns exact match when version matches exactly', () => {
      const result = findBestXcodeMatch('16.2', installed);

      expect(result).toEqual({
        version: '16.2',
        appPath: '/Applications/Xcode_16.2.app',
      });
    });

    it('returns latest matching version for major-only request (fuzzy match)', () => {
      const result = findBestXcodeMatch('16', installed);

      // 16.2 is the latest 16.x, and the list is sorted descending
      expect(result).toEqual({
        version: '16.2',
        appPath: '/Applications/Xcode_16.2.app',
      });
    });

    it('returns exact match for single-segment version like "26"', () => {
      const result = findBestXcodeMatch('26', installed);

      expect(result).toEqual({
        version: '26',
        appPath: '/Applications/Xcode_26.app',
      });
    });

    it('returns null when no matching version exists', () => {
      const result = findBestXcodeMatch('17', installed);

      expect(result).toBeNull();
    });

    it('returns null when requested version partially matches but is not a valid prefix', () => {
      // "1" should not match "16.2" because "1." is not a valid prefix of "16.2"
      // Wait — actually "1." IS a prefix check against "16.2" starting with "1."? No, "16.2" does not start with "1."
      const result = findBestXcodeMatch('1', installed);

      expect(result).toBeNull();
    });

    it('fuzzy matches "15" to "15.4"', () => {
      const result = findBestXcodeMatch('15', installed);

      expect(result).toEqual({
        version: '15.4',
        appPath: '/Applications/Xcode_15.4.app',
      });
    });
  });

  // -----------------------------------------------------------------------
  // selectXcodeVersion
  // -----------------------------------------------------------------------

  describe('selectXcodeVersion', () => {
    it('logs current Xcode version when no version is requested', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('Xcode 16.2\nBuild version 16C5032a\n'));
        return 0;
      });

      await selectXcodeVersion(undefined);

      expect(core.info).toHaveBeenCalledWith('Step: Xcode version (using runner default)');
      expect(core.info).toHaveBeenCalledWith('Current Xcode: Xcode 16.2');
      // Should NOT have called sudo xcode-select
      expect(mockExec).not.toHaveBeenCalledWith(
        'sudo',
        expect.arrayContaining(['xcode-select']),
        expect.any(Object),
      );
    });

    it('selects the exact requested version and verifies', async () => {
      const dir = makeFakeApplicationsDir(['15.4', '16.0', '16.2']);

      // First call: sudo xcode-select -s
      // Second call: xcodebuild -version
      let callCount = 0;
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        callCount++;
        if (callCount === 1) {
          // sudo xcode-select -s
          return 0;
        }
        // xcodebuild -version
        options?.listeners?.stdout?.(Buffer.from('Xcode 16.2\nBuild version 16C5032a\n'));
        return 0;
      });

      await selectXcodeVersion('16.2', dir);

      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining('Selecting Xcode 16.2'),
      );
      expect(mockExec).toHaveBeenCalledWith(
        'sudo',
        ['xcode-select', '-s', `${dir}/Xcode_16.2.app`],
        expect.any(Object),
      );
      expect(core.info).toHaveBeenCalledWith('Active Xcode: Xcode 16.2');

      fs.rmSync(dir, { recursive: true });
    });

    it('fuzzy matches major version to latest minor', async () => {
      const dir = makeFakeApplicationsDir(['16.0', '16.1', '16.2']);

      let callCount = 0;
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        callCount++;
        if (callCount === 1) return 0;
        options?.listeners?.stdout?.(Buffer.from('Xcode 16.2\n'));
        return 0;
      });

      await selectXcodeVersion('16', dir);

      expect(mockExec).toHaveBeenCalledWith(
        'sudo',
        ['xcode-select', '-s', `${dir}/Xcode_16.2.app`],
        expect.any(Object),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('throws when requested version is not found, listing available versions', async () => {
      const dir = makeFakeApplicationsDir(['15.4', '16.0']);

      await expect(selectXcodeVersion('17', dir)).rejects.toThrow(
        /Xcode version "17" not found/,
      );
      await expect(selectXcodeVersion('17', dir)).rejects.toThrow(
        /Available versions: 16\.0, 15\.4/,
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('throws when no Xcode installations exist at all', async () => {
      const dir = makeFakeApplicationsDir([]);

      await expect(selectXcodeVersion('16', dir)).rejects.toThrow(
        /No Xcode installations found/,
      );

      fs.rmSync(dir, { recursive: true });
    });
  });
});
