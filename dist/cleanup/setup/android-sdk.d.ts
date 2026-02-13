/**
 * Detect the Android SDK location.
 *
 * Checks in order:
 * 1. ANDROID_HOME environment variable (already set)
 * 2. ANDROID_SDK_ROOT environment variable (deprecated but still used)
 * 3. Well-known paths for the current platform
 *
 * @returns The SDK path, or null if not found.
 */
export declare function detectAndroidSdk(): string | null;
/**
 * Ensure ANDROID_HOME is set and the SDK is available.
 *
 * On GitHub Actions runners, the SDK is pre-installed but ANDROID_HOME
 * may not be exported in all contexts (e.g. act Docker images).
 * This function detects the SDK and exports the environment variable.
 */
export declare function setupAndroidSdk(): Promise<void>;
/**
 * Write a local.properties file pointing to the Android SDK.
 * Gradle uses this to find the SDK when ANDROID_HOME is not set
 * in the process environment (e.g. when Fastlane spawns Gradle).
 */
export declare function writeLocalProperties(projectDir: string): Promise<void>;
//# sourceMappingURL=android-sdk.d.ts.map