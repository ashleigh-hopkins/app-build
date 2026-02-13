import * as fs from 'fs';
import { z } from 'zod';
import {
  AppBuildConfigSchema,
  type AppBuildConfig,
  type IosBuildConfig,
  type AndroidBuildConfig,
  type SubmitConfig,
  type SigningConfig,
  type UpdatesConfig,
  type VersionConfig,
} from './schema';
import {
  DEFAULT_PROFILE,
  DEFAULT_NODE_VERSION,
  DEFAULT_FASTLANE_VERSION,
  DEFAULT_ANDROID_TRACK,
  DEFAULT_IOS_EXPORT_METHOD,
  DEFAULT_IOS_BUILD_CONFIGURATION,
  DEFAULT_ANDROID_BUILD_TYPE,
  DEFAULT_ANDROID_AAB,
  DEFAULT_IOS_SIGNING_METHOD,
  DEFAULT_ANDROID_SIGNING_METHOD,
  DEFAULT_VERSION_SOURCE,
} from './defaults';

// ---------------------------------------------------------------------------
// Action inputs — mirrors action.yml
// ---------------------------------------------------------------------------

export interface ActionInputs {
  platform: 'ios' | 'android';
  profile: string;
  submit: boolean;
  ota: boolean;
  versionBump: boolean;
  cache: boolean;
  fingerprint: boolean;
  skipPrebuild: boolean;
  prebuildClean: boolean;
  nodeVersion: string;
  fastlaneVersion: string;
  xcodeVersion?: string;
  versionStrategy?: string;
  versionGitTagPattern?: string;
  iosScheme?: string;
  iosBuildConfiguration?: string;
  // credential inputs
  iosCertificateP12?: string;
  iosCertificatePassword?: string;
  iosProvisioningProfile?: string;
  iosExtensionProfiles?: string;
  matchPassword?: string;
  matchGitPrivateKey?: string;
  ascApiKeyId?: string;
  ascApiIssuerId?: string;
  ascApiKeyP8?: string;
  androidKeystore?: string;
  androidKeystorePassword?: string;
  androidKeyAlias?: string;
  androidKeyPassword?: string;
  googlePlayServiceAccount?: string;
}

// ---------------------------------------------------------------------------
// Resolved config — flat object consumed by the pipeline
// ---------------------------------------------------------------------------

export interface ResolvedConfig {
  // Platform & profile
  platform: 'ios' | 'android';
  profile: string;

  // Build settings (platform-specific)
  ios?: IosBuildConfig;
  android?: AndroidBuildConfig;

  // Behaviour flags
  submit: boolean;
  ota: boolean;
  versionBump: boolean;
  cache: boolean;
  fingerprint: boolean;
  skipPrebuild: boolean;
  prebuildClean: boolean;

  // Tool versions
  nodeVersion: string;
  fastlaneVersion: string;
  xcodeVersion?: string;

  // Submit config
  submitConfig?: SubmitConfig;

  // Signing config
  signingConfig?: SigningConfig;

  // OTA updates config
  updatesConfig?: UpdatesConfig;

  // Version config
  versionConfig?: VersionConfig;
  versionStrategy?: string;
  versionGitTagPattern?: string;

  // Credentials — pass-through from action inputs
  credentials: {
    iosCertificateP12?: string;
    iosCertificatePassword?: string;
    iosProvisioningProfile?: string;
    iosExtensionProfiles?: string;
    matchPassword?: string;
    matchGitPrivateKey?: string;
    ascApiKeyId?: string;
    ascApiIssuerId?: string;
    ascApiKeyP8?: string;
    androidKeystore?: string;
    androidKeystorePassword?: string;
    androidKeyAlias?: string;
    androidKeyPassword?: string;
    googlePlayServiceAccount?: string;
  };
}

// ---------------------------------------------------------------------------
// parseConfigFile — read JSON from disk and validate with zod
// ---------------------------------------------------------------------------

export async function parseConfigFile(configPath: string): Promise<AppBuildConfig> {
  // Config file is optional — return empty config if it doesn't exist
  if (!fs.existsSync(configPath)) {
    return {} as AppBuildConfig;
  }

  let raw: string;
  try {
    raw = await fs.promises.readFile(configPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to read config file at "${configPath}": ${message}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Config file "${configPath}" contains invalid JSON`);
  }

  const result = AppBuildConfigSchema.safeParse(json);
  if (!result.success) {
    const fieldErrors = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    });
    throw new Error(
      `Invalid config in "${configPath}":\n${fieldErrors.join('\n')}`,
    );
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// getProfileConfig — extract platform-specific build config for a profile
// ---------------------------------------------------------------------------

export function getProfileConfig(
  config: AppBuildConfig,
  profileName: string,
  platform: 'ios' | 'android',
): IosBuildConfig | AndroidBuildConfig | undefined {
  // When no config file exists (empty config), return undefined — use defaults
  if (!config.build) {
    return undefined;
  }

  const profile = config.build[profileName];
  if (!profile) {
    const available = Object.keys(config.build).join(', ');
    throw new Error(
      `Build profile "${profileName}" not found. Available profiles: ${available}`,
    );
  }

  const platformConfig = profile[platform];
  if (!platformConfig) {
    const configured = (
      [
        profile.ios ? 'ios' : null,
        profile.android ? 'android' : null,
      ].filter(Boolean) as string[]
    ).join(', ');
    throw new Error(
      `Platform "${platform}" is not configured in profile "${profileName}". ` +
        `Configured platforms: ${configured || 'none'}`,
    );
  }

  return platformConfig;
}

// ---------------------------------------------------------------------------
// mergeActionInputs — action inputs take precedence over config file
// ---------------------------------------------------------------------------

export function mergeActionInputs(
  config: AppBuildConfig,
  inputs: ActionInputs,
): ResolvedConfig {
  const profileName = inputs.profile || DEFAULT_PROFILE;
  const platform = inputs.platform;

  // Extract the platform-specific build config
  const platformConfig = getProfileConfig(config, profileName, platform);

  // Build the resolved config — inputs override file values
  const resolved: ResolvedConfig = {
    platform,
    profile: profileName,

    submit: inputs.submit,
    ota: inputs.ota,
    versionBump: inputs.versionBump,
    cache: inputs.cache,
    fingerprint: inputs.fingerprint,
    skipPrebuild: inputs.skipPrebuild,
    prebuildClean: inputs.prebuildClean,

    nodeVersion: inputs.nodeVersion || DEFAULT_NODE_VERSION,
    fastlaneVersion: inputs.fastlaneVersion || DEFAULT_FASTLANE_VERSION,
    xcodeVersion: inputs.xcodeVersion,
    versionStrategy: inputs.versionStrategy,
    versionGitTagPattern: inputs.versionGitTagPattern,

    submitConfig: config.submit,
    signingConfig: config.signing,
    updatesConfig: config.updates,
    versionConfig: config.version
      ? { ...config.version, source: config.version.source ?? DEFAULT_VERSION_SOURCE }
      : undefined,

    credentials: {
      iosCertificateP12: inputs.iosCertificateP12,
      iosCertificatePassword: inputs.iosCertificatePassword,
      iosProvisioningProfile: inputs.iosProvisioningProfile,
      iosExtensionProfiles: inputs.iosExtensionProfiles,
      matchPassword: inputs.matchPassword,
      matchGitPrivateKey: inputs.matchGitPrivateKey,
      ascApiKeyId: inputs.ascApiKeyId,
      ascApiIssuerId: inputs.ascApiIssuerId,
      ascApiKeyP8: inputs.ascApiKeyP8,
      androidKeystore: inputs.androidKeystore,
      androidKeystorePassword: inputs.androidKeystorePassword,
      androidKeyAlias: inputs.androidKeyAlias,
      androidKeyPassword: inputs.androidKeyPassword,
      googlePlayServiceAccount: inputs.googlePlayServiceAccount,
    },
  };

  // When no config file exists, platformConfig is undefined — use sensible defaults.
  // Spread to avoid mutating the original config object.
  if (platform === 'ios') {
    resolved.ios = { ...((platformConfig as IosBuildConfig | undefined) ?? {
      scheme: undefined as unknown as string,
      buildConfiguration: DEFAULT_IOS_BUILD_CONFIGURATION,
      exportMethod: DEFAULT_IOS_EXPORT_METHOD,
    } as IosBuildConfig) };

    // Action inputs override config file values for scheme and build configuration
    if (inputs.iosScheme) {
      resolved.ios.scheme = inputs.iosScheme;
    }
    if (inputs.iosBuildConfiguration) {
      resolved.ios.buildConfiguration = inputs.iosBuildConfiguration;
    }
  } else {
    resolved.android = { ...((platformConfig as AndroidBuildConfig | undefined) ?? {
      buildType: DEFAULT_ANDROID_BUILD_TYPE,
      aab: DEFAULT_ANDROID_AAB,
    } as AndroidBuildConfig) };
  }

  return resolved;
}
