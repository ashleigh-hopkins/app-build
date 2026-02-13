/** Default build profile name when none specified in action inputs. */
export const DEFAULT_PROFILE = 'production';

/** Default path to the config file relative to the workspace root. */
export const DEFAULT_CONFIG_PATH = './app-build.json';

/** Default Node.js version for the runner. */
export const DEFAULT_NODE_VERSION = '20';

/** Default Fastlane version — 'latest' installs the most recent release. */
export const DEFAULT_FASTLANE_VERSION = 'latest';

/** Default Google Play track for Android submission. */
export const DEFAULT_ANDROID_TRACK = 'internal';

/** Default Xcode export method for iOS builds. */
export const DEFAULT_IOS_EXPORT_METHOD = 'app-store';

/** Default Xcode build configuration for iOS builds. */
export const DEFAULT_IOS_BUILD_CONFIGURATION = 'Release';

/** Default Gradle build type for Android builds. */
export const DEFAULT_ANDROID_BUILD_TYPE = 'release';

/** Whether to produce an AAB (true) or APK (false) by default. */
export const DEFAULT_ANDROID_AAB = true;

/** Default iOS code-signing method. */
export const DEFAULT_IOS_SIGNING_METHOD = 'manual';

/** Default Android code-signing method. */
export const DEFAULT_ANDROID_SIGNING_METHOD = 'manual';

/** Default source file for version information. */
export const DEFAULT_VERSION_SOURCE = 'app.json';
