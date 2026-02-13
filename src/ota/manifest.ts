import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { runCommand } from '../utils/exec';

export interface AssetInfo {
  hash: string;
  key: string;
  contentType: string;
  fileExtension: string;
  url: string;
}

export interface UpdateManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: AssetInfo;
  assets: AssetInfo[];
  metadata: Record<string, unknown>;
  extra: Record<string, unknown>;
}

/**
 * Expo metadata.json structure (written by `npx expo export`).
 * Used to locate bundles and assets without guessing paths.
 */
interface ExpoMetadata {
  version: number;
  bundler: string;
  fileMetadata: Record<
    string,
    {
      bundle: string;
      assets: Array<{ ext: string; path: string }>;
    }
  >;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.js': 'application/javascript',
  '.hbc': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream';
}

function hashFileBase64Url(filePath: string): string {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('base64url');
  return hash;
}

function buildAssetInfo(
  filePath: string,
  baseUrl: string,
  distDir: string,
  extOverride?: string,
): AssetInfo {
  const relativePath = path.relative(distDir, filePath);
  const ext = extOverride ? `.${extOverride}` : path.extname(filePath);
  const key = path.basename(filePath, path.extname(filePath));

  return {
    hash: hashFileBase64Url(filePath),
    key,
    contentType: extOverride
      ? (CONTENT_TYPE_MAP[`.${extOverride}`] ?? 'application/octet-stream')
      : getContentType(filePath),
    fileExtension: ext,
    url: `${baseUrl}/${relativePath}`,
  };
}

/**
 * Read the expo metadata.json from the dist directory.
 * Returns null if the file doesn't exist or is invalid.
 */
function readExpoMetadata(distDir: string): ExpoMetadata | null {
  const metadataPath = path.join(distDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(metadataPath, 'utf-8');
    return JSON.parse(raw) as ExpoMetadata;
  } catch {
    return null;
  }
}

/**
 * Find the JS/HBC bundle file for a given platform.
 *
 * Strategy:
 * 1. Read metadata.json (SDK 49+) — contains exact bundle path per platform
 * 2. Fallback: scan dist root for legacy `{platform}-<hash>.js` (pre-SDK 49)
 */
function findBundleFile(distDir: string, platform: string): string {
  // Strategy 1: Read metadata.json (written by `npx expo export`)
  const metadata = readExpoMetadata(distDir);
  if (metadata?.fileMetadata?.[platform]?.bundle) {
    const bundleRelPath = metadata.fileMetadata[platform].bundle;
    const bundleAbsPath = path.join(distDir, bundleRelPath);
    if (fs.existsSync(bundleAbsPath)) {
      return bundleAbsPath;
    }
  }

  // Strategy 2: Legacy format — {platform}-<hash>.js in dist root
  const entries = fs.readdirSync(distDir);
  const bundleFile = entries.find(
    (entry) =>
      entry.startsWith(`${platform}-`) &&
      (entry.endsWith('.js') || entry.endsWith('.hbc')),
  );
  if (bundleFile) {
    return path.join(distDir, bundleFile);
  }

  throw new Error(
    `No bundle file found for platform "${platform}" in "${distDir}". ` +
      'Expected metadata.json with fileMetadata, or a file matching ' +
      `"${platform}-<hash>.js" / "${platform}-<hash>.hbc".`,
  );
}

function scanAssetsDir(assetsDir: string): string[] {
  if (!fs.existsSync(assetsDir)) {
    return [];
  }

  const files: string[] = [];

  function walk(dir: string): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(assetsDir);
  return files;
}

export async function generateManifest(params: {
  distDir: string;
  runtimeVersion: string;
  baseUrl: string;
  platform: string;
}): Promise<UpdateManifest> {
  const { distDir, runtimeVersion, baseUrl, platform } = params;

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const bundlePath = findBundleFile(distDir, platform);
  const launchAsset = buildAssetInfo(bundlePath, baseUrl, distDir);

  // Build assets list — prefer metadata.json (has extension info for hash-only filenames)
  const metadata = readExpoMetadata(distDir);
  const metadataAssets = metadata?.fileMetadata?.[platform]?.assets;

  let assets: AssetInfo[];
  if (metadataAssets && metadataAssets.length > 0) {
    // SDK 49+: assets listed in metadata.json with extension info
    assets = metadataAssets
      .filter((a) => {
        const absPath = path.join(distDir, a.path);
        return fs.existsSync(absPath);
      })
      .map((a) =>
        buildAssetInfo(path.join(distDir, a.path), baseUrl, distDir, a.ext),
      );
  } else {
    // Legacy: scan assets/ directory
    const assetsDir = path.join(distDir, 'assets');
    const assetFiles = scanAssetsDir(assetsDir);
    assets = assetFiles.map((file) =>
      buildAssetInfo(file, baseUrl, distDir),
    );
  }

  return {
    id,
    createdAt,
    runtimeVersion,
    launchAsset,
    assets,
    metadata: {},
    extra: {},
  };
}

export async function writeManifest(
  manifest: UpdateManifest,
  outputPath: string,
): Promise<void> {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await fs.promises.writeFile(outputPath, JSON.stringify(manifest, null, 2));
}

export async function readRuntimeVersion(projectDir: string): Promise<string> {
  const appJsonPath = path.join(projectDir, 'app.json');

  // Try app.json first
  let appJsonResult: string | null = null;
  try {
    const raw = fs.readFileSync(appJsonPath, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(`app.json at "${appJsonPath}" contains invalid JSON.`);
    }

    // Check expo.runtimeVersion first
    const expo = parsed.expo as Record<string, unknown> | undefined;
    if (expo && typeof expo.runtimeVersion === 'string') {
      return expo.runtimeVersion;
    }

    // Fall back to top-level runtimeVersion
    if (typeof parsed.runtimeVersion === 'string') {
      return parsed.runtimeVersion;
    }

    // app.json exists but has no runtimeVersion — will try dynamic config
    appJsonResult = 'no-runtime-version';
  } catch (err) {
    // If the error is about invalid JSON, re-throw immediately
    if (err instanceof Error && err.message.includes('invalid JSON')) {
      throw err;
    }
    // app.json doesn't exist — will try dynamic config
    appJsonResult = 'not-found';
  }

  // Try dynamic config (app.config.js / app.config.ts)
  const hasDynamicConfig =
    fs.existsSync(path.join(projectDir, 'app.config.js')) ||
    fs.existsSync(path.join(projectDir, 'app.config.ts'));

  if (hasDynamicConfig) {
    try {
      const { stdout } = await runCommand('npx', ['expo', 'config', '--type', 'public', '--json'], {
        cwd: projectDir,
      });
      const resolved = JSON.parse(stdout.trim()) as Record<string, unknown>;

      if (typeof resolved.runtimeVersion === 'string') {
        return resolved.runtimeVersion;
      }
    } catch {
      // Dynamic config resolution failed — fall through to error
    }
  }

  // Provide appropriate error message
  if (appJsonResult === 'not-found' && !hasDynamicConfig) {
    throw new Error(
      `Failed to read app.json at "${appJsonPath}". Ensure the file exists.`,
    );
  }

  throw new Error(
    'runtimeVersion is required in app.json for OTA updates',
  );
}
