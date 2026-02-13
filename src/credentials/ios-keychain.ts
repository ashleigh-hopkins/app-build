import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';
import { decodeBase64ToFile, maskSecret } from '../utils/secrets';
import { registerCleanupFile, registerCleanupKeychain } from '../utils/cleanup';

const KEYCHAIN_NAME = 'app-build.keychain-db';
const CERT_TEMP_PATH = '/tmp/app-build-cert.p12';
const PROVISIONING_PROFILES_DIR = path.join(
  process.env.HOME || '~',
  'Library',
  'MobileDevice',
  'Provisioning Profiles',
);

export interface InstalledProfile {
  uuid: string;
  name: string;
  bundleId: string;
  teamId: string;
  filePath: string;
}

export interface IosKeychainResult {
  keychainName: string;
  keychainPath: string;
  profiles: InstalledProfile[];
}

/**
 * Decode a provisioning profile's XML plist and extract metadata.
 * Uses `security cms -D -i <path>` to decode the CMS envelope.
 */
export async function extractProfileMetadata(profilePath: string): Promise<InstalledProfile> {
  const { stdout } = await runCommand('security', ['cms', '-D', '-i', profilePath]);

  // Extract UUID
  const uuidMatch = stdout.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/);
  if (!uuidMatch) {
    throw new Error(`Could not extract UUID from provisioning profile: ${profilePath}`);
  }
  const uuid = uuidMatch[1];

  // Extract Name
  const nameMatch = stdout.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/);
  if (!nameMatch) {
    throw new Error(`Could not extract Name from provisioning profile: ${profilePath}`);
  }
  const name = nameMatch[1];

  // Extract TeamIdentifier
  const teamMatch = stdout.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
  if (!teamMatch) {
    throw new Error(`Could not extract TeamIdentifier from provisioning profile: ${profilePath}`);
  }
  const teamId = teamMatch[1];

  // Extract bundle identifier from Entitlements.application-identifier
  // Format is "<teamId>.<bundleId>" — strip the team ID prefix
  const appIdMatch = stdout.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/);
  if (!appIdMatch) {
    throw new Error(`Could not extract application-identifier from provisioning profile: ${profilePath}`);
  }
  const fullAppId = appIdMatch[1];
  const bundleId = fullAppId.startsWith(`${teamId}.`)
    ? fullAppId.substring(teamId.length + 1)
    : fullAppId;

  return { uuid, name, bundleId, teamId, filePath: profilePath };
}

/**
 * Install a single provisioning profile by decoding base64, extracting its UUID,
 * and copying it to ~/Library/MobileDevice/Provisioning Profiles/<uuid>.mobileprovision.
 */
async function installProfile(base64Content: string, label: string): Promise<InstalledProfile> {
  // Decode to a temp file
  const tempPath = `/tmp/app-build-profile-${label}.mobileprovision`;
  await decodeBase64ToFile(base64Content, tempPath);

  // Extract metadata to get the UUID
  const metadata = await extractProfileMetadata(tempPath);

  // Copy to the system location using UUID as filename
  await fs.promises.mkdir(PROVISIONING_PROFILES_DIR, { recursive: true });
  const installPath = path.join(PROVISIONING_PROFILES_DIR, `${metadata.uuid}.mobileprovision`);
  await fs.promises.copyFile(tempPath, installPath);

  // Register cleanup
  registerCleanupFile(tempPath);
  registerCleanupFile(installPath);

  // Mask the base64 secret
  maskSecret(base64Content);

  // Update filePath to the installed location
  metadata.filePath = installPath;

  core.info(`Installed profile "${metadata.name}" (${metadata.bundleId}) -> ${installPath}`);

  return metadata;
}

export async function installIosCredentials(
  credentials: {
    certificateP12: string;
    certificatePassword: string;
    provisioningProfile: string;
  },
  projectDir: string,
  extensionProfiles?: Record<string, string>,
): Promise<IosKeychainResult> {
  // 1. Generate a random password for the temp keychain
  const keychainPassword = crypto.randomBytes(24).toString('hex');

  // 2. Create temp keychain
  await runCommand('security', [
    'create-keychain',
    '-p',
    keychainPassword,
    KEYCHAIN_NAME,
  ]);

  // 3. Configure keychain timeout
  await runCommand('security', [
    'set-keychain-settings',
    '-lut',
    '21600',
    KEYCHAIN_NAME,
  ]);

  // 4. Set as default keychain
  await runCommand('security', [
    'default-keychain',
    '-s',
    KEYCHAIN_NAME,
  ]);

  // 5. Unlock keychain
  await runCommand('security', [
    'unlock-keychain',
    '-p',
    keychainPassword,
    KEYCHAIN_NAME,
  ]);

  // 6. Add to search list (preserve login keychain)
  await runCommand('security', [
    'list-keychains',
    '-d',
    'user',
    '-s',
    KEYCHAIN_NAME,
    'login.keychain-db',
  ]);

  // 7. Decode .p12 certificate to temp file
  await decodeBase64ToFile(credentials.certificateP12, CERT_TEMP_PATH);

  // 8. Import certificate into keychain
  await runCommand('security', [
    'import',
    CERT_TEMP_PATH,
    '-k',
    KEYCHAIN_NAME,
    '-P',
    credentials.certificatePassword,
    '-T',
    '/usr/bin/codesign',
    '-T',
    '/usr/bin/security',
  ]);

  // 9. Set partition list for codesigning access
  await runCommand('security', [
    'set-key-partition-list',
    '-S',
    'apple-tool:,apple:',
    '-s',
    '-k',
    keychainPassword,
    KEYCHAIN_NAME,
  ]);

  // 10. Install the main provisioning profile
  const profiles: InstalledProfile[] = [];
  const mainProfile = await installProfile(credentials.provisioningProfile, 'main');
  profiles.push(mainProfile);

  // 11. Install extension profiles (if provided)
  if (extensionProfiles) {
    for (const [bundleId, base64] of Object.entries(extensionProfiles)) {
      const sanitizedLabel = bundleId.replace(/[^a-zA-Z0-9.-]/g, '_');
      const extProfile = await installProfile(base64, `ext-${sanitizedLabel}`);
      profiles.push(extProfile);
    }
  }

  // 12. Register cleanup for keychain and temp files
  registerCleanupKeychain(KEYCHAIN_NAME);
  registerCleanupFile(CERT_TEMP_PATH);

  // 13. Mask all secrets
  maskSecret(credentials.certificateP12);
  maskSecret(credentials.certificatePassword);
  maskSecret(credentials.provisioningProfile);
  maskSecret(keychainPassword);

  core.info(`iOS keychain and ${profiles.length} provisioning profile(s) installed`);

  // 14. Return result
  return {
    keychainName: KEYCHAIN_NAME,
    keychainPath: KEYCHAIN_NAME,
    profiles,
  };
}
