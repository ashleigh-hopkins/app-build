import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import { registerCleanupFile } from './cleanup';

export async function decodeBase64ToFile(
  base64: string,
  filePath: string
): Promise<string> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const buffer = Buffer.from(base64, 'base64');
  await fs.promises.writeFile(filePath, buffer);

  registerCleanupFile(filePath);
  return filePath;
}

export function maskSecret(value: string): void {
  core.setSecret(value);
}

export async function maskFileContent(filePath: string): Promise<void> {
  const content = await fs.promises.readFile(filePath, 'utf8');
  core.setSecret(content);
}
