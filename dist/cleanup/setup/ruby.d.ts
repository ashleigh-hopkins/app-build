/**
 * Generate a Gemfile at the given project directory with the specified
 * Fastlane version.  When {@link fastlaneVersion} is `"latest"` the gem
 * is listed without a version constraint; otherwise a pessimistic pin
 * (`~>`) is used.
 *
 * @returns The absolute path to the generated Gemfile.
 */
export declare function generateGemfile(fastlaneVersion: string, projectDir: string, platform?: string): Promise<string>;
/**
 * Check whether Fastlane is available (via Bundler) in the given
 * project directory.
 *
 * @returns `true` when `bundle exec fastlane --version` exits 0.
 */
export declare function isFastlaneAvailable(projectDir: string): Promise<boolean>;
/**
 * High-level helper that ensures Ruby and Fastlane are ready to use:
 *
 * 1. Verify Ruby is installed.
 * 2. If no `Gemfile` exists in {@link projectDir}, generate one.
 * 3. Run `bundle install` with vendored gems for caching.
 * 4. Verify Fastlane works through Bundler.
 */
export declare function setupRubyAndFastlane(fastlaneVersion: string, projectDir: string, platform?: string): Promise<void>;
//# sourceMappingURL=ruby.d.ts.map