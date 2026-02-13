import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as core from '@actions/core';
import * as cache from '@actions/cache';

const FINGERPRINT_MARKER_DIR = path.join(os.tmpdir(), 'app-build-fingerprint');

interface FingerprintMarker {
  hash: string;
  timestamp: string;
  platform: string;
}

function markerPath(): string {
  return path.join(FINGERPRINT_MARKER_DIR, 'marker.json');
}

function cacheKey(platform: string, hash: string): string {
  return `native-build-${platform}-${hash}`;
}

/**
 * Check if a native build with this fingerprint has been done before.
 * Returns true if a cached marker exists (meaning we can skip native build).
 */
export async function restoreFingerprintCache(
  platform: string,
  hash: string,
): Promise<boolean> {
  const key = cacheKey(platform, hash);
  fs.mkdirSync(FINGERPRINT_MARKER_DIR, { recursive: true });

  try {
    const hit = await cache.restoreCache([FINGERPRINT_MARKER_DIR], key);
    if (hit) {
      core.info(`Fingerprint cache hit: ${key} — native build already exists for this fingerprint`);
      return true;
    }
    core.info(`Fingerprint cache miss: ${key} — native build required`);
    return false;
  } catch (err) {
    core.info(`Fingerprint cache restore failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

/**
 * Save a marker indicating a native build was done for this fingerprint.
 * Called after a successful native build so future builds can skip.
 */
export async function saveFingerprintCache(
  platform: string,
  hash: string,
): Promise<void> {
  const key = cacheKey(platform, hash);
  fs.mkdirSync(FINGERPRINT_MARKER_DIR, { recursive: true });

  const marker: FingerprintMarker = {
    hash,
    timestamp: new Date().toISOString(),
    platform,
  };

  fs.writeFileSync(markerPath(), JSON.stringify(marker, null, 2));

  try {
    await cache.saveCache([FINGERPRINT_MARKER_DIR], key);
    core.info(`Fingerprint cache saved: ${key}`);
  } catch (err) {
    // Cache save can fail if key already exists (immutable) — that's fine
    core.info(`Fingerprint cache save: ${err instanceof Error ? err.message : err}`);
  }
}
