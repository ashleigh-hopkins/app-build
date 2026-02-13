import * as core from '@actions/core';
import * as fs from 'fs';
import { exec } from '@actions/exec';

const cleanupFiles: string[] = [];
const cleanupKeychains: string[] = [];

export function registerCleanupFile(filePath: string): void {
  cleanupFiles.push(filePath);
}

export function registerCleanupKeychain(keychainName: string): void {
  cleanupKeychains.push(keychainName);
}

export async function runCleanup(): Promise<void> {
  for (const filePath of cleanupFiles) {
    try {
      core.info(`Removing file: ${filePath}`);
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore errors — file may already be deleted
    }
  }

  for (const keychain of cleanupKeychains) {
    try {
      core.info(`Deleting keychain: ${keychain}`);
      await exec('security', ['delete-keychain', keychain]);
    } catch {
      // Ignore errors — keychain may not exist
    }
  }
}
