import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { decodeBase64ToFile, maskSecret } from '../utils/secrets';
import { registerCleanupFile } from '../utils/cleanup';

const KEYSTORE_TEMP_PATH = '/tmp/app-build-upload.keystore';

export interface AndroidKeystoreResult {
  keystorePath: string;
  keyAlias: string;
}

export async function installAndroidKeystore(
  credentials: {
    androidKeystore: string;
    androidKeystorePassword: string;
    androidKeyAlias: string;
    androidKeyPassword: string;
  },
  projectDir: string,
): Promise<AndroidKeystoreResult> {
  // 1. Validate all required credential fields
  if (!credentials.androidKeystore) {
    throw new Error(
      'Missing android-keystore input (base64-encoded .jks/.keystore file)',
    );
  }
  if (!credentials.androidKeystorePassword) {
    throw new Error('Missing android-keystore-password input');
  }
  if (!credentials.androidKeyAlias) {
    throw new Error('Missing android-key-alias input');
  }
  if (!credentials.androidKeyPassword) {
    throw new Error('Missing android-key-password input');
  }

  // 2. Decode base64 keystore to temp file
  await decodeBase64ToFile(credentials.androidKeystore, KEYSTORE_TEMP_PATH);

  // 3. Mask all secret values
  maskSecret(credentials.androidKeystorePassword);
  maskSecret(credentials.androidKeyPassword);
  maskSecret(credentials.androidKeystore);

  // 4. Register the keystore temp file for cleanup
  registerCleanupFile(KEYSTORE_TEMP_PATH);

  // 5. Write signing config to gradle.properties (append, don't overwrite)
  const gradlePropsPath = path.join(projectDir, 'android', 'gradle.properties');
  const gradleDir = path.dirname(gradlePropsPath);
  await fs.promises.mkdir(gradleDir, { recursive: true });

  let existingContent = '';
  try {
    existingContent = await fs.promises.readFile(gradlePropsPath, 'utf-8');
  } catch {
    // File doesn't exist yet — start fresh
  }

  const signingProps = [
    `MYAPP_UPLOAD_STORE_FILE=${KEYSTORE_TEMP_PATH}`,
    `MYAPP_UPLOAD_KEY_ALIAS=${credentials.androidKeyAlias}`,
    `MYAPP_UPLOAD_STORE_PASSWORD=${credentials.androidKeystorePassword}`,
    `MYAPP_UPLOAD_KEY_PASSWORD=${credentials.androidKeyPassword}`,
  ].join('\n');

  const separator = existingContent.length > 0 && !existingContent.endsWith('\n') ? '\n' : '';
  const newContent = existingContent + separator + signingProps + '\n';

  await fs.promises.writeFile(gradlePropsPath, newContent, 'utf-8');

  core.info('Android keystore signing config written to gradle.properties');

  // 6. Patch build.gradle to use release signing config
  await patchBuildGradleSigningConfig(projectDir);

  // 7. Return result
  return {
    keystorePath: KEYSTORE_TEMP_PATH,
    keyAlias: credentials.androidKeyAlias,
  };
}

/**
 * Patch android/app/build.gradle to add a release signing config
 * that reads from our MYAPP_UPLOAD_* gradle.properties.
 * Expo's default build.gradle uses signingConfigs.debug for release builds.
 */
async function patchBuildGradleSigningConfig(projectDir: string): Promise<void> {
  const gradlePath = path.join(projectDir, 'android', 'app', 'build.gradle');
  const gradleKtsPath = path.join(projectDir, 'android', 'app', 'build.gradle.kts');

  let filePath: string;
  let content: string;
  try {
    content = await fs.promises.readFile(gradlePath, 'utf-8');
    filePath = gradlePath;
  } catch {
    try {
      content = await fs.promises.readFile(gradleKtsPath, 'utf-8');
      filePath = gradleKtsPath;
    } catch {
      core.info('No build.gradle found — skipping signing config patch');
      return;
    }
  }

  // Check if release signing config already references our properties
  if (content.includes('MYAPP_UPLOAD_STORE_FILE')) {
    core.info('build.gradle already references MYAPP_UPLOAD_* — skipping patch');
    return;
  }

  // Add release signing config block after the debug config
  const releaseSigningConfig = `
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }`;

  // Insert after the debug signing config block
  const debugConfigEnd = content.indexOf('}', content.indexOf('signingConfigs'));
  if (debugConfigEnd === -1) {
    core.warning('Could not find signingConfigs block — skipping patch');
    return;
  }

  // Find the closing brace of the debug block within signingConfigs
  const signingConfigsStart = content.indexOf('signingConfigs');
  const signingConfigsBlock = content.substring(signingConfigsStart);

  // Replace signingConfigs.debug in release buildType with signingConfigs.release
  let patched = content;

  // Add release signing config after debug config
  // Find the pattern: signingConfigs { debug { ... } }
  const debugBlockMatch = patched.match(/signingConfigs\s*\{[^}]*debug\s*\{[^}]*\}/);
  if (debugBlockMatch) {
    const insertPos = patched.indexOf(debugBlockMatch[0]) + debugBlockMatch[0].length;
    patched = patched.slice(0, insertPos) + releaseSigningConfig + patched.slice(insertPos);
  }

  // Replace signingConfig signingConfigs.debug in release buildType
  patched = patched.replace(
    /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release',
  );

  await fs.promises.writeFile(filePath, patched, 'utf-8');
  core.info('Patched build.gradle with release signing config');
}

export async function verifyKeystoreSigningConfig(
  projectDir: string,
): Promise<void> {
  const gradlePath = path.join(projectDir, 'android', 'app', 'build.gradle');
  const gradleKtsPath = path.join(projectDir, 'android', 'app', 'build.gradle.kts');

  let content: string | undefined;
  for (const candidate of [gradlePath, gradleKtsPath]) {
    try {
      content = await fs.promises.readFile(candidate, 'utf-8');
      break;
    } catch {
      // Try next candidate
    }
  }

  if (!content) {
    core.warning(
      'Could not find android/app/build.gradle or build.gradle.kts. ' +
        'Signing config verification skipped.',
    );
    return;
  }

  if (!content.includes('signingConfigs')) {
    core.warning(
      'No signingConfigs block found in build.gradle. ' +
        'You may need to configure signing in your build.gradle. ' +
        'If using Expo, running expo prebuild should set this up automatically.',
    );
  }
}
