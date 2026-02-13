import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import { setupNode, installDependencies } from '../../src/setup/node';

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

// Helper: create a temp directory with an optional lockfile
function makeTempProject(lockfile?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-build-node-test-'));
  if (lockfile) {
    fs.writeFileSync(path.join(dir, lockfile), '');
  }
  return dir;
}

describe('setup/node', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // setupNode
  // -----------------------------------------------------------------------

  describe('setupNode', () => {
    it('logs the requested Node version', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('v20.11.0\n'));
        return 0;
      });

      await setupNode('20');

      expect(core.info).toHaveBeenCalledWith('Setting up Node.js v20');
    });

    it('runs node --version and logs the current version', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('v20.11.0\n'));
        return 0;
      });

      await setupNode('20');

      expect(mockExec).toHaveBeenCalledWith(
        'node',
        ['--version'],
        expect.any(Object),
      );
      expect(core.info).toHaveBeenCalledWith('Current Node.js version: v20.11.0');
    });

    it('warns when the current major version does not match the requested version', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('v20.11.0\n'));
        return 0;
      });

      await setupNode('18.19.0');

      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Requested Node.js v18.19.0 but the current version is v20.11.0'),
      );
    });

    it('does not warn when the major version matches', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('v20.11.0\n'));
        return 0;
      });

      await setupNode('20.14.0');

      expect(core.warning).not.toHaveBeenCalled();
    });

    it('does not warn when only major version is requested and matches', async () => {
      mockExec.mockImplementation(async (_cmd, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from('v20.11.0\n'));
        return 0;
      });

      await setupNode('20');

      expect(core.warning).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // installDependencies
  // -----------------------------------------------------------------------

  describe('installDependencies', () => {
    it('runs "bun install" when bun.lockb is present', async () => {
      const dir = makeTempProject('bun.lockb');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: bun');
      expect(mockExec).toHaveBeenCalledWith(
        'bun',
        ['install'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('runs "pnpm install" when pnpm-lock.yaml is present', async () => {
      const dir = makeTempProject('pnpm-lock.yaml');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: pnpm');
      expect(mockExec).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('runs "yarn install --frozen-lockfile" when yarn.lock is present', async () => {
      const dir = makeTempProject('yarn.lock');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: yarn');
      expect(mockExec).toHaveBeenCalledWith(
        'yarn',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('runs "npm ci" when package-lock.json is present', async () => {
      const dir = makeTempProject('package-lock.json');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: npm');
      expect(mockExec).toHaveBeenCalledWith(
        'npm',
        ['ci'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('prefers bun over pnpm when both lockfiles exist', async () => {
      const dir = makeTempProject();
      fs.writeFileSync(path.join(dir, 'bun.lockb'), '');
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: bun');
      expect(mockExec).toHaveBeenCalledWith(
        'bun',
        ['install'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('prefers pnpm over yarn when both lockfiles exist', async () => {
      const dir = makeTempProject();
      fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '');
      fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: pnpm');

      fs.rmSync(dir, { recursive: true });
    });

    it('prefers yarn over npm when both lockfiles exist', async () => {
      const dir = makeTempProject();
      fs.writeFileSync(path.join(dir, 'yarn.lock'), '');
      fs.writeFileSync(path.join(dir, 'package-lock.json'), '');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.info).toHaveBeenCalledWith('Detected package manager: yarn');

      fs.rmSync(dir, { recursive: true });
    });

    it('falls back to "npm install" with a warning when no lockfile exists', async () => {
      const dir = makeTempProject();
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      expect(core.warning).toHaveBeenCalledWith(
        'No lockfile found — falling back to npm install',
      );
      expect(mockExec).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({ cwd: dir }),
      );

      fs.rmSync(dir, { recursive: true });
    });

    it('passes projectDir as cwd to the install command', async () => {
      const dir = makeTempProject('package-lock.json');
      mockExec.mockResolvedValue(0);

      await installDependencies(dir);

      const callArgs = mockExec.mock.calls[0];
      expect(callArgs[2]).toEqual(expect.objectContaining({ cwd: dir }));

      fs.rmSync(dir, { recursive: true });
    });
  });
});
