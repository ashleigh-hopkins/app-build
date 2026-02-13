/**
 * Cloudflare Worker for serving Expo Updates (OTA) manifests.
 *
 * Fetches manifest.json from R2 (or any S3-compatible store) and returns it
 * with the correct expo-updates protocol v1 headers.
 *
 * Expected storage layout (produced by app-build's OTA upload step):
 *
 *   <PREFIX>/<runtimeVersion>/<platform>/manifest.json
 *   <PREFIX>/<runtimeVersion>/<platform>/bundles/...
 *   <PREFIX>/<runtimeVersion>/<platform>/assets/...
 *
 * Bindings (set in wrangler.toml):
 *   OTA_BUCKET   — R2 bucket binding
 *
 * Environment variables (set in wrangler.toml [vars]):
 *   OTA_PREFIX   — Key prefix before runtimeVersion (optional, default "")
 *   S3_ENDPOINT  — If using external S3 instead of R2, set the endpoint URL
 *   S3_BUCKET    — If using external S3 instead of R2, set the bucket name
 *   S3_ACCESS_KEY_ID     — S3 access key (use secrets, not vars)
 *   S3_SECRET_ACCESS_KEY — S3 secret key (use secrets, not vars)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssetInfo {
  hash: string;
  key: string;
  contentType: string;
  fileExtension: string;
  url: string;
}

interface UpdateManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: AssetInfo;
  assets: AssetInfo[];
  metadata: Record<string, unknown>;
  extra: Record<string, unknown>;
}

interface Env {
  // R2 bucket binding (preferred)
  OTA_BUCKET?: R2Bucket;
  // Fallback: external S3
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  // Common
  OTA_PREFIX?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Build the storage key for a manifest file.
 *
 * Layout: {prefix}/{runtimeVersion}/{platform}/manifest.json
 */
function manifestKey(
  prefix: string,
  runtimeVersion: string,
  platform: string,
): string {
  const parts = [prefix, runtimeVersion, platform, "manifest.json"].filter(
    Boolean,
  );
  return parts.join("/");
}

/**
 * Fetch manifest from R2.
 */
async function fetchFromR2(
  bucket: R2Bucket,
  key: string,
): Promise<UpdateManifest> {
  const object = await bucket.get(key);
  if (!object) {
    throw new Error(`NotFound: ${key}`);
  }
  const text = await object.text();
  return JSON.parse(text) as UpdateManifest;
}

/**
 * Fetch manifest from an external S3-compatible endpoint.
 * Uses unsigned requests — the bucket must allow public read,
 * or you can extend this with AWS Signature V4.
 */
async function fetchFromS3(
  endpoint: string,
  bucket: string,
  key: string,
): Promise<UpdateManifest> {
  const url = `${endpoint.replace(/\/$/, "")}/${bucket}/${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`S3 fetch failed: ${response.status} ${response.statusText} for ${url}`);
  }

  const text = await response.text();
  return JSON.parse(text) as UpdateManifest;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Only respond to GET requests on the manifest path.
    // Adjust the path to match your routing.
    if (request.method !== "GET") {
      return errorResponse(405, "Method not allowed");
    }

    // ── Parse query parameters ────────────────────────────────────────────
    const platform = url.searchParams.get("platform");
    const runtimeVersion = url.searchParams.get("runtimeVersion");

    if (!platform || !["ios", "android"].includes(platform)) {
      return errorResponse(
        400,
        'Missing or invalid "platform" query parameter. Expected "ios" or "android".',
      );
    }

    if (!runtimeVersion) {
      return errorResponse(400, 'Missing "runtimeVersion" query parameter.');
    }

    // ── Determine storage backend ─────────────────────────────────────────
    const prefix = env.OTA_PREFIX ?? "";
    const key = manifestKey(prefix, runtimeVersion, platform);

    let manifest: UpdateManifest;
    try {
      if (env.OTA_BUCKET) {
        // Preferred: Cloudflare R2 binding
        manifest = await fetchFromR2(env.OTA_BUCKET, key);
      } else if (env.S3_ENDPOINT && env.S3_BUCKET) {
        // Fallback: external S3-compatible storage
        manifest = await fetchFromS3(env.S3_ENDPOINT, env.S3_BUCKET, key);
      } else {
        return errorResponse(
          500,
          "No storage backend configured. Bind an R2 bucket (OTA_BUCKET) or set S3_ENDPOINT + S3_BUCKET.",
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes("NotFound") || message.includes("404")) {
        return errorResponse(
          404,
          `No update found for platform="${platform}", runtimeVersion="${runtimeVersion}".`,
        );
      }

      console.error("Failed to fetch manifest:", message);
      return errorResponse(500, "Internal error fetching manifest");
    }

    // ── Build expo-updates protocol v1 response ───────────────────────────
    //
    // TODO: Support `expo-expect-signature` header for signed manifests.
    //       When the client sends this header, the response should include
    //       a signature in the `expo-signature` header or as part of a
    //       multipart response. For now, we return unsigned JSON.

    const responseHeaders = new Headers({
      "content-type": "application/json",
      "expo-protocol-version": "1",
      "expo-sfv-version": "0",
      "cache-control":
        "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
      "expo-manifest-filters": `platform="${platform}"`,
    });

    return new Response(JSON.stringify(manifest), {
      status: 200,
      headers: responseHeaders,
    });
  },
};
