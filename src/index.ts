import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseConfigFile,
  mergeActionInputs,
  type ActionInputs,
  type ResolvedConfig,
} from './config/parser';
import { DEFAULT_CONFIG_PATH, DEFAULT_PROFILE } from './config/defaults';
// Setup
import { setupNode, installDependencies } from './setup/node';
import { setupRubyAndFastlane } from './setup/ruby';
import { restoreCaches, saveCaches } from './setup/cache';
import { setupAndroidSdk, writeLocalProperties } from './setup/android-sdk';
import { selectXcodeVersion } from './setup/xcode';
// Prebuild
import { runExpoPrebuild, verifyNativeProject } from './prebuild/expo';
import { runPodInstall } from './prebuild/pods';
// Credentials
import { installAndroidKeystore } from './credentials/android-keystore';
import { installIosCredentials, type InstalledProfile } from './credentials/ios-keychain';
import { installIosCredentialsViaMatch } from './credentials/ios-match';
import { installAscApiKey } from './credentials/asc-api-key';
// Build
import { buildAndroid } from './build/android';
import { buildIos } from './build/ios';
// Submit
import { submitToGooglePlay } from './submit/google-play';
import { submitToAppStore } from './submit/app-store';
// Version
import { bumpVersion } from './version/bump';
// OTA
import { runExpoExport } from './ota/export';
import { generateManifest, writeManifest, readRuntimeVersion } from './ota/manifest';
import { uploadOtaUpdate } from './ota/upload';
// Fingerprint
import { computeFingerprint } from './fingerprint/compute';
import { restoreFingerprintCache, saveFingerprintCache } from './fingerprint/cache';

/**
 * Resolve and change to the working directory if specified.
 * Must be called before any path-relative operations (config parsing, npm install, etc.).
 * Exported for testability.
 */
export function resolveWorkingDirectory(workingDirectory: string | undefined): void {
  if (!workingDirectory) {
    return;
  }

  const resolvedDir = path.resolve(process.cwd(), workingDirectory);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(
      `Working directory "${workingDirectory}" does not exist (resolved to "${resolvedDir}").`
    );
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(
      `Working directory "${workingDirectory}" is not a directory (resolved to "${resolvedDir}").`
    );
  }

  process.chdir(resolvedDir);
  core.info(`Working directory: ${resolvedDir}`);
}

/**
 * Parse a JSON string of environment variables and set them on process.env.
 * Logs the keys being set (not values, which may be sensitive).
 * Returns the parsed object for testability.
 */
export function applyEnvironmentVariables(jsonInput: string): Record<string, string> {
  if (!jsonInput) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonInput);
  } catch {
    throw new Error(
      `Invalid JSON in "environment" input. Expected a JSON object (e.g., '{"APP_ENV": "production"}'). ` +
      `Received: ${jsonInput}`
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `The "environment" input must be a JSON object (e.g., '{"APP_ENV": "production"}'). ` +
      `Received ${Array.isArray(parsed) ? 'an array' : typeof parsed}.`
    );
  }

  const env = parsed as Record<string, unknown>;
  const keys: string[] = [];

  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== 'string') {
      throw new Error(
        `Environment variable "${key}" must be a string value. Got ${typeof value}.`
      );
    }
    process.env[key] = value;
    keys.push(key);
  }

  if (keys.length > 0) {
    core.info(`Environment variables set: ${keys.join(', ')}`);
  }

  return env as Record<string, string>;
}

/**
 * Read all action inputs from the workflow and return a typed ActionInputs object.
 */
function readActionInputs(): ActionInputs {
  const platform = core.getInput('platform', { required: true });
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error(`Invalid platform "${platform}". Must be "ios" or "android".`);
  }

  return {
    platform,
    profile: core.getInput('profile') || DEFAULT_PROFILE,
    submit: core.getInput('submit') === 'true',
    ota: core.getInput('ota') === 'true',
    versionBump: core.getInput('version-bump') === 'true',
    cache: core.getInput('cache') !== 'false',
    fingerprint: core.getInput('fingerprint') === 'true',
    skipPrebuild: core.getInput('skip-prebuild') === 'true',
    prebuildClean: core.getInput('prebuild-clean') === 'true',
    nodeVersion: core.getInput('node-version') || '20',
    fastlaneVersion: core.getInput('fastlane-version') || 'latest',
    iosCertificateP12: core.getInput('ios-certificate-p12') || undefined,
    iosCertificatePassword: core.getInput('ios-certificate-password'),  // empty string is valid (no password)
    iosProvisioningProfile: core.getInput('ios-provisioning-profile') || undefined,
    iosExtensionProfiles: core.getInput('ios-extension-profiles') || undefined,
    matchPassword: core.getInput('match-password') || undefined,
    matchGitPrivateKey: core.getInput('match-git-private-key') || undefined,
    ascApiKeyId: core.getInput('asc-api-key-id') || undefined,
    ascApiIssuerId: core.getInput('asc-api-issuer-id') || undefined,
    ascApiKeyP8: core.getInput('asc-api-key-p8') || undefined,
    androidKeystore: core.getInput('android-keystore') || undefined,
    androidKeystorePassword: core.getInput('android-keystore-password') || undefined,
    androidKeyAlias: core.getInput('android-key-alias') || undefined,
    androidKeyPassword: core.getInput('android-key-password') || undefined,
    googlePlayServiceAccount: core.getInput('google-play-service-account') || undefined,
    xcodeVersion: core.getInput('xcode-version') || undefined,
    versionStrategy: core.getInput('version-strategy') || undefined,
    versionGitTagPattern: core.getInput('version-git-tag-pattern') || undefined,
    iosScheme: core.getInput('ios-scheme') || undefined,
    iosBuildConfiguration: core.getInput('ios-build-configuration') || undefined,
  };
}

/**
 * Mask all credential values so they never appear in logs.
 */
function maskCredentials(config: ResolvedConfig): void {
  const creds = config.credentials;
  const values = [
    creds.iosCertificateP12, creds.iosCertificatePassword, creds.iosProvisioningProfile,
    creds.iosExtensionProfiles,
    creds.matchPassword, creds.matchGitPrivateKey,
    creds.ascApiKeyId, creds.ascApiIssuerId, creds.ascApiKeyP8,
    creds.androidKeystore, creds.androidKeystorePassword, creds.androidKeyAlias, creds.androidKeyPassword,
    creds.googlePlayServiceAccount,
  ];
  for (const v of values) {
    if (v) core.setSecret(v);
  }
}

/**
 * Run setup steps common to all build pipelines.
 */
async function runSetup(config: ResolvedConfig, projectDir: string): Promise<void> {
  core.info('=== Setup ===');
  await setupNode(config.nodeVersion);

  if (config.cache) {
    core.info('Step: Restore caches');
    await restoreCaches(config.platform, projectDir);
  }

  await installDependencies(projectDir);
  await setupRubyAndFastlane(config.fastlaneVersion, projectDir, config.platform);

  // Android SDK setup (detect and export ANDROID_HOME)
  if (config.platform === 'android') {
    core.info('Step: Android SDK setup');
    await setupAndroidSdk();
  }
}

/**
 * Run the Android build pipeline.
 */
async function runAndroidBuildPipeline(config: ResolvedConfig, projectDir: string): Promise<void> {
  core.info('=== Android Build Pipeline ===');
  if (!config.android) throw new Error('Android build config is missing. Check your app-build.json.');

  if (config.versionBump) {
    core.info('Step: Version bump');
    const bump = await bumpVersion('android', projectDir, config.versionConfig?.source, config.versionStrategy as any, config.versionGitTagPattern);
    core.info(`Version bumped: ${bump.field} ${bump.previousValue} → ${bump.newValue}`);
  }

  if (config.skipPrebuild) {
    core.info('Step: Prebuild (skipped — native dirs pre-committed)');
  } else {
    core.info('Step: Prebuild (android)');
    await runExpoPrebuild('android', projectDir, config.prebuildClean ? { clean: true } : undefined);
  }
  await verifyNativeProject('android', projectDir);

  // Write local.properties so Gradle can find the SDK
  await writeLocalProperties(projectDir);

  core.info('Step: Install credentials (android)');
  const creds = config.credentials;
  if (!creds.androidKeystore || !creds.androidKeystorePassword || !creds.androidKeyAlias || !creds.androidKeyPassword) {
    throw new Error('Android signing credentials are required. Provide android-keystore, android-keystore-password, android-key-alias, and android-key-password inputs.');
  }
  await installAndroidKeystore({
    androidKeystore: creds.androidKeystore,
    androidKeystorePassword: creds.androidKeystorePassword,
    androidKeyAlias: creds.androidKeyAlias,
    androidKeyPassword: creds.androidKeyPassword,
  }, projectDir);

  core.info('Step: Build (android)');
  const artifactPath = await buildAndroid(config.android, projectDir);

  if (config.submit) {
    core.info('Step: Submit (android)');
    if (!creds.googlePlayServiceAccount) throw new Error('google-play-service-account input is required for Android submission.');
    if (!config.submitConfig?.android?.packageName) throw new Error('submit.android.packageName is required in app-build.json for Android submission.');
    await submitToGooglePlay({
      artifactPath,
      packageName: config.submitConfig.android.packageName,
      track: config.submitConfig.android.track || 'internal',
      serviceAccountBase64: creds.googlePlayServiceAccount,
      projectDir,
    });
  } else {
    core.info('Step: Submit (skipped)');
    core.setOutput('submission-status', 'skipped');
  }
}

/**
 * Run the iOS build pipeline.
 */
async function runIosBuildPipeline(config: ResolvedConfig, projectDir: string): Promise<void> {
  core.info('=== iOS Build Pipeline ===');
  if (!config.ios) throw new Error('iOS build config is missing. Check your app-build.json.');
  const creds = config.credentials;

  // Select Xcode version (or log current version)
  await selectXcodeVersion(config.xcodeVersion);

  if (config.versionBump) {
    core.info('Step: Version bump');
    const bump = await bumpVersion('ios', projectDir, config.versionConfig?.source, config.versionStrategy as any, config.versionGitTagPattern);
    core.info(`Version bumped: ${bump.field} ${bump.previousValue} → ${bump.newValue}`);
  }

  // Prebuild + pod install (workspace is created by pod install, not prebuild)
  if (config.skipPrebuild) {
    core.info('Step: Prebuild (skipped — native dirs pre-committed)');
  } else {
    core.info('Step: Prebuild (ios)');
    await runExpoPrebuild('ios', projectDir, config.prebuildClean ? { clean: true } : undefined);
  }
  await runPodInstall(projectDir);
  await verifyNativeProject('ios', projectDir);

  // Install credentials
  core.info('Step: Install credentials (ios)');
  const signingMethod = config.signingConfig?.ios?.method || 'manual';
  let installedProfiles: InstalledProfile[] | undefined;

  if (signingMethod === 'match') {
    if (!creds.matchPassword) throw new Error('match-password input is required for match signing.');
    const iosSigningConfig = config.signingConfig?.ios;
    const matchType = iosSigningConfig && 'type' in iosSigningConfig ? iosSigningConfig.type : undefined;
    const matchStorage = iosSigningConfig && 'storage' in iosSigningConfig ? iosSigningConfig.storage : undefined;
    const matchGitUrl = iosSigningConfig && 'gitUrl' in iosSigningConfig ? iosSigningConfig.gitUrl : undefined;
    await installIosCredentialsViaMatch({
      type: matchType || 'appstore',
      storage: matchStorage || 'git',
      gitUrl: matchGitUrl,
      matchPassword: creds.matchPassword,
      gitPrivateKey: creds.matchGitPrivateKey,
    }, projectDir);
  } else {
    // Manual signing
    if (!creds.iosCertificateP12 || !creds.iosProvisioningProfile) {
      throw new Error('iOS signing credentials are required. Provide ios-certificate-p12 and ios-provisioning-profile inputs.');
    }

    // Parse extension profiles if provided
    let extensionProfiles: Record<string, string> | undefined;
    if (creds.iosExtensionProfiles) {
      try {
        extensionProfiles = JSON.parse(creds.iosExtensionProfiles) as Record<string, string>;
      } catch {
        throw new Error('ios-extension-profiles input must be valid JSON (map of bundle ID to base64-encoded profile).');
      }
    }

    const keychainResult = await installIosCredentials({
      certificateP12: creds.iosCertificateP12,
      certificatePassword: creds.iosCertificatePassword ?? '',
      provisioningProfile: creds.iosProvisioningProfile,
    }, projectDir, extensionProfiles);

    installedProfiles = keychainResult.profiles;
  }

  // Build
  core.info('Step: Build (ios)');

  // Determine build options from installed profiles
  let buildOptions: { profiles?: InstalledProfile[]; teamId?: string; xcodeprojPath?: string } | undefined;
  if (installedProfiles && installedProfiles.length > 0) {
    const teamId = installedProfiles[0].teamId;

    // Find the .xcodeproj path inside ios/
    const iosDir = path.join(projectDir, 'ios');
    const iosDirEntries = fs.readdirSync(iosDir);
    const xcodeprojName = iosDirEntries.find((e) => e.endsWith('.xcodeproj'));
    if (!xcodeprojName) {
      throw new Error(`No .xcodeproj found in "${iosDir}". Ensure the iOS project exists.`);
    }
    const xcodeprojPath = path.join(iosDir, xcodeprojName);

    buildOptions = { profiles: installedProfiles, teamId, xcodeprojPath };
  }

  const artifactPath = await buildIos(config.ios, projectDir, buildOptions);

  // Submit
  if (config.submit) {
    core.info('Step: Submit (ios)');
    if (!creds.ascApiKeyId || !creds.ascApiIssuerId || !creds.ascApiKeyP8) {
      throw new Error('App Store Connect API credentials are required for iOS submission. Provide asc-api-key-id, asc-api-issuer-id, and asc-api-key-p8 inputs.');
    }
    const ascKey = await installAscApiKey({
      keyId: creds.ascApiKeyId,
      issuerId: creds.ascApiIssuerId,
      keyP8: creds.ascApiKeyP8,
    });
    await submitToAppStore({
      artifactPath,
      ascApiKeyId: creds.ascApiKeyId!,
      ascApiIssuerId: creds.ascApiIssuerId!,
      ascApiKeyP8Path: ascKey.keyFilePath,
      projectDir,
    });
  } else {
    core.info('Step: Submit (skipped)');
    core.setOutput('submission-status', 'skipped');
  }
}

/**
 * Run the OTA update pipeline.
 */
async function runOtaPipeline(config: ResolvedConfig, projectDir: string): Promise<void> {
  core.info(`=== OTA pipeline: platform=${config.platform} ===`);

  // Setup Node + deps (no Ruby/Fastlane needed for OTA)
  core.info('Step: Setup');
  await setupNode(config.nodeVersion);
  await installDependencies(projectDir);

  // Read runtime version
  core.info('Step: Read runtime version');
  const runtimeVersion = await readRuntimeVersion(projectDir);
  core.info(`Runtime version: ${runtimeVersion}`);

  // Export to platform-specific subdirectory (dist/<platform>/)
  // This enables multi-platform OTA on static hosts (GitHub Pages, plain S3)
  // where header-based routing isn't available.
  core.info('Step: Export (expo export)');
  const platformDistDir = path.join(projectDir, 'dist', config.platform);
  const distDir = await runExpoExport(config.platform, projectDir, platformDistDir);

  // Generate manifest with platform-prefixed asset URLs
  core.info('Step: Generate manifest');
  const rawBaseUrl = (config.updatesConfig?.url || '').replace(/\/+$/, '').replace(/\/manifest\.json$/, '');
  if (!rawBaseUrl) {
    core.warning('updates.url not set in app-build.json — manifest asset URLs will be relative.');
  }
  const baseUrl = rawBaseUrl ? `${rawBaseUrl}/${config.platform}` : '';
  const manifest = await generateManifest({
    distDir,
    runtimeVersion,
    baseUrl,
    platform: config.platform,
  });
  const manifestPath = `${distDir}/manifest.json`;
  await writeManifest(manifest, manifestPath);

  core.setOutput('ota-update-id', manifest.id);
  core.setOutput('ota-manifest-url', `${rawBaseUrl}/${config.platform}/manifest.json`);

  // Upload
  if (config.updatesConfig?.storage) {
    core.info('Step: Upload');
    await uploadOtaUpdate({
      distDir,
      manifestPath,
      storage: config.updatesConfig.storage,
    });
  } else {
    core.info('Step: Upload (skipped — no storage configured)');
    core.info(`OTA artifacts exported to: ${distDir}`);
  }
}

/**
 * Main entry point.
 */
async function run(): Promise<void> {
  try {
    // Change to working directory first — all subsequent paths are relative to it
    resolveWorkingDirectory(core.getInput('working-directory') || undefined);

    // Apply custom environment variables before any other processing.
    // These are inherited by all child processes (expo prebuild, fastlane, etc.)
    applyEnvironmentVariables(core.getInput('environment'));

    const inputs = readActionInputs();
    core.info(`app-build: platform=${inputs.platform} profile=${inputs.profile} submit=${inputs.submit} ota=${inputs.ota}`);

    const configPath = core.getInput('config') || DEFAULT_CONFIG_PATH;
    const rawConfig = await parseConfigFile(configPath);
    const config = mergeActionInputs(rawConfig, inputs);
    maskCredentials(config);

    const projectDir = process.cwd();

    // Fingerprint check — detect if native code changed.
    // Must run after npm install (needs node_modules for @expo/fingerprint)
    // but before the build pipeline decision.
    let fingerprintHash: string | undefined;
    let skipNativeBuild = false;

    if (config.fingerprint && !config.ota) {
      core.info('=== Fingerprint Check ===');

      // Need node_modules installed for @expo/fingerprint
      await setupNode(config.nodeVersion);
      await installDependencies(projectDir);

      const fp = await computeFingerprint(config.platform, projectDir);
      fingerprintHash = fp.hash;
      core.setOutput('fingerprint-hash', fp.hash);

      const cached = await restoreFingerprintCache(config.platform, fp.hash);
      if (cached) {
        skipNativeBuild = true;
        core.info('Native fingerprint unchanged — will publish OTA update instead of native build');
        core.setOutput('build-mode', 'ota');
      } else {
        core.info('Native fingerprint changed — proceeding with native build');
        core.setOutput('build-mode', 'native');
      }
    }

    if (config.ota || skipNativeBuild) {
      // OTA pipeline: either explicitly requested or auto-routed via fingerprint
      if (skipNativeBuild) {
        core.info('=== OTA Pipeline (fingerprint-routed) ===');
      }
      await runOtaPipeline(config, projectDir);
    } else {
      core.setOutput('build-mode', config.fingerprint ? 'native' : 'full');
      await runSetup(config, projectDir);
      if (config.platform === 'android') {
        await runAndroidBuildPipeline(config, projectDir);
      } else {
        await runIosBuildPipeline(config, projectDir);
      }

      if (config.cache) {
        core.info('Step: Save caches');
        await saveCaches(config.platform, projectDir);
      }

      // After successful native build, cache the fingerprint
      if (fingerprintHash) {
        core.info('Step: Save fingerprint cache');
        await saveFingerprintCache(config.platform, fingerprintHash);
      }
    }

    core.info('app-build: pipeline complete');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
