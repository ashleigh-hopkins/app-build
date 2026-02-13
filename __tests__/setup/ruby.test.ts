import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import {
  generateGemfile,
  isFastlaneAvailable,
  setupRubyAndFastlane,
} from '../../src/setup/ruby';

const mockExec = actionsExec.exec as jest.MockedFunction<
  typeof actionsExec.exec
>;

describe('setup/ruby', () => {
  let tmpDir: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'ruby-setup-test-')
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // generateGemfile
  // ---------------------------------------------------------------------------
  describe('generateGemfile', () => {
    it('generates a Gemfile with unpinned fastlane when version is "latest"', async () => {
      const result = await generateGemfile('latest', tmpDir);

      expect(result).toBe(path.join(tmpDir, 'Gemfile'));
      const content = await fs.promises.readFile(result, 'utf8');
      expect(content).toBe(
        'source "https://rubygems.org"\n\ngem "fastlane"\n'
      );
    });

    it('generates a Gemfile with pessimistic pin for a specific version', async () => {
      const result = await generateGemfile('2.225.0', tmpDir);

      expect(result).toBe(path.join(tmpDir, 'Gemfile'));
      const content = await fs.promises.readFile(result, 'utf8');
      expect(content).toBe(
        'source "https://rubygems.org"\n\ngem "fastlane", "~> 2.225.0"\n'
      );
    });

    it('returns the absolute path to the generated Gemfile', async () => {
      const result = await generateGemfile('latest', tmpDir);

      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toBe(path.join(tmpDir, 'Gemfile'));
    });

    it('logs that a Gemfile was generated', async () => {
      await generateGemfile('latest', tmpDir);

      expect(core.info).toHaveBeenCalledWith(
        `Generated Gemfile at ${path.join(tmpDir, 'Gemfile')}`
      );
    });

    it('handles another specific version correctly', async () => {
      await generateGemfile('2.220.0', tmpDir);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(content).toContain('gem "fastlane", "~> 2.220.0"');
    });

    it('includes cocoapods gem when platform is ios', async () => {
      await generateGemfile('latest', tmpDir, 'ios');

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(content).toContain('gem "fastlane"');
      expect(content).toContain('gem "cocoapods"');
    });

    it('does not include cocoapods gem when platform is android', async () => {
      await generateGemfile('latest', tmpDir, 'android');

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(content).toContain('gem "fastlane"');
      expect(content).not.toContain('cocoapods');
    });

    it('does not include cocoapods gem when platform is undefined', async () => {
      await generateGemfile('latest', tmpDir);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(content).not.toContain('cocoapods');
    });
  });

  // ---------------------------------------------------------------------------
  // isFastlaneAvailable
  // ---------------------------------------------------------------------------
  describe('isFastlaneAvailable', () => {
    it('returns true when bundle exec fastlane succeeds', async () => {
      mockExec.mockResolvedValue(0);

      const result = await isFastlaneAvailable(tmpDir);

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', '--version'],
        expect.objectContaining({ cwd: tmpDir })
      );
    });

    it('returns false when bundle exec fastlane fails', async () => {
      mockExec.mockRejectedValue(new Error('command not found'));

      const result = await isFastlaneAvailable(tmpDir);

      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // setupRubyAndFastlane
  // ---------------------------------------------------------------------------
  describe('setupRubyAndFastlane', () => {
    it('calls ruby --version, bundle --version, bundle config, bundle install, and bundle exec fastlane in order', async () => {
      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('latest', tmpDir);

      // Collect all commands that were invoked
      const calls = mockExec.mock.calls.map(
        ([cmd, args]) => `${cmd} ${(args ?? []).join(' ')}`
      );

      expect(calls[0]).toBe('ruby --version');
      expect(calls[1]).toBe('bundle --version');
      expect(calls[2]).toBe('bundle config set path vendor/bundle');
      expect(calls[3]).toBe('bundle install');
      expect(calls[4]).toBe('bundle exec fastlane --version');
    });

    it('generates a Gemfile when none exists in the project directory', async () => {
      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('2.225.0', tmpDir);

      const gemfile = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(gemfile).toContain('gem "fastlane", "~> 2.225.0"');
    });

    it('includes cocoapods in generated Gemfile when platform is ios', async () => {
      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('latest', tmpDir, 'ios');

      const gemfile = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(gemfile).toContain('gem "cocoapods"');
    });

    it('does not overwrite an existing Gemfile', async () => {
      const existingContent = 'source "https://rubygems.org"\ngem "cocoapods"\n';
      await fs.promises.writeFile(
        path.join(tmpDir, 'Gemfile'),
        existingContent,
        'utf8'
      );

      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('2.225.0', tmpDir);

      const content = await fs.promises.readFile(
        path.join(tmpDir, 'Gemfile'),
        'utf8'
      );
      expect(content).toBe(existingContent);
    });

    it('runs bundle install with cwd set to projectDir', async () => {
      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('latest', tmpDir);

      // Find the bundle install call
      const bundleInstallCall = mockExec.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'bundle' && args?.[0] === 'install'
      );

      expect(bundleInstallCall).toBeDefined();
      const options = bundleInstallCall![2] as Record<string, unknown>;
      expect(options.cwd).toBe(tmpDir);
    });

    it('runs bundle exec fastlane with cwd set to projectDir', async () => {
      mockExec.mockResolvedValue(0);

      await setupRubyAndFastlane('latest', tmpDir);

      // Find the bundle exec fastlane call
      const fastlaneCall = mockExec.mock.calls.find(
        ([cmd, args]) =>
          cmd === 'bundle' && args?.[0] === 'exec' && args?.[1] === 'fastlane'
      );

      expect(fastlaneCall).toBeDefined();
      const options = fastlaneCall![2] as Record<string, unknown>;
      expect(options.cwd).toBe(tmpDir);
    });

    it('throws when ruby --version fails', async () => {
      mockExec.mockRejectedValueOnce(
        new Error('Command failed: ruby --version (exit code 127)\nruby: not found')
      );

      await expect(
        setupRubyAndFastlane('latest', tmpDir)
      ).rejects.toThrow('ruby');
    });

    it('throws when bundle install fails', async () => {
      // ruby --version succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle --version succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle install fails
      mockExec.mockRejectedValueOnce(
        new Error('Command failed: bundle install (exit code 1)')
      );

      await expect(
        setupRubyAndFastlane('latest', tmpDir)
      ).rejects.toThrow('bundle install');
    });

    it('installs bundler when bundle --version fails', async () => {
      // ruby --version succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle --version fails (not installed)
      mockExec.mockRejectedValueOnce(new Error('not found'));
      // gem install bundler succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle install succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle exec fastlane succeeds
      mockExec.mockResolvedValueOnce(0);

      await setupRubyAndFastlane('latest', tmpDir);

      const calls = mockExec.mock.calls.map(
        ([cmd, args]) => `${cmd} ${(args ?? []).join(' ')}`
      );
      expect(calls).toContain('gem install bundler --no-document');
    });

    it('throws when bundle exec fastlane verification fails', async () => {
      // ruby --version succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle --version succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle install succeeds
      mockExec.mockResolvedValueOnce(0);
      // bundle exec fastlane --version fails
      mockExec.mockRejectedValueOnce(
        new Error('Command failed: bundle exec fastlane --version (exit code 1)')
      );

      await expect(
        setupRubyAndFastlane('latest', tmpDir)
      ).rejects.toThrow('fastlane');
    });
  });
});
