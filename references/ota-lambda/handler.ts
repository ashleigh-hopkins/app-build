/**
 * AWS Lambda handler for serving Expo Updates (OTA) manifests.
 *
 * This function sits behind API Gateway (or a Lambda Function URL) and serves
 * the expo-updates protocol v1 manifest for a given platform + runtimeVersion.
 *
 * Expected S3 layout (produced by app-build's OTA upload step):
 *
 *   s3://<BUCKET>/<PREFIX>/<runtimeVersion>/<platform>/manifest.json
 *   s3://<BUCKET>/<PREFIX>/<runtimeVersion>/<platform>/bundles/...
 *   s3://<BUCKET>/<PREFIX>/<runtimeVersion>/<platform>/assets/...
 *
 * Environment variables:
 *   OTA_BUCKET       — S3 bucket name (required)
 *   OTA_PREFIX       — Key prefix before runtimeVersion (optional, default "")
 *   AWS_REGION       — Set automatically by Lambda
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// ─── Types ───────────────────────────────────────────────────────────────────

interface APIGatewayEvent {
  headers: Record<string, string | undefined>;
  queryStringParameters: Record<string, string | undefined> | null;
}

interface LambdaResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

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

// ─── Config ──────────────────────────────────────────────────────────────────

const BUCKET = process.env.OTA_BUCKET ?? "";
const PREFIX = process.env.OTA_PREFIX ?? "";

const s3 = new S3Client({});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function errorResponse(statusCode: number, message: string): LambdaResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ error: message }),
  };
}

/**
 * Build the S3 key for a manifest file.
 *
 * Layout: {prefix}/{runtimeVersion}/{platform}/manifest.json
 */
function manifestKey(runtimeVersion: string, platform: string): string {
  const parts = [PREFIX, runtimeVersion, platform, "manifest.json"].filter(
    Boolean,
  );
  return parts.join("/");
}

/**
 * Fetch manifest.json from S3 and parse it.
 */
async function fetchManifest(
  runtimeVersion: string,
  platform: string,
): Promise<UpdateManifest> {
  const key = manifestKey(runtimeVersion, platform);

  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );

  const body = await response.Body?.transformToString("utf-8");
  if (!body) {
    throw new Error(`Empty response for s3://${BUCKET}/${key}`);
  }

  return JSON.parse(body) as UpdateManifest;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function handler(event: APIGatewayEvent): Promise<LambdaResponse> {
  // ── Validate required env ───────────────────────────────────────────────
  if (!BUCKET) {
    return errorResponse(500, "OTA_BUCKET environment variable is not set");
  }

  // ── Parse query parameters ──────────────────────────────────────────────
  const params = event.queryStringParameters ?? {};
  const platform = params.platform;
  const runtimeVersion = params.runtimeVersion;

  if (!platform || !["ios", "android"].includes(platform)) {
    return errorResponse(
      400,
      'Missing or invalid "platform" query parameter. Expected "ios" or "android".',
    );
  }

  if (!runtimeVersion) {
    return errorResponse(
      400,
      'Missing "runtimeVersion" query parameter.',
    );
  }

  // ── Fetch manifest from S3 ──────────────────────────────────────────────
  let manifest: UpdateManifest;
  try {
    manifest = await fetchManifest(runtimeVersion, platform);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    // S3 NoSuchKey → 404
    if (message.includes("NoSuchKey") || message.includes("AccessDenied")) {
      return errorResponse(
        404,
        `No update found for platform="${platform}", runtimeVersion="${runtimeVersion}".`,
      );
    }

    console.error("Failed to fetch manifest:", message);
    return errorResponse(500, "Internal error fetching manifest");
  }

  // ── Build expo-updates protocol v1 response ─────────────────────────────
  //
  // The expo-updates client expects:
  //   - Header `expo-protocol-version: 1`
  //   - JSON body matching the UpdateManifest shape
  //
  // For the full multipart manifest format (used when code-signing is
  // enabled), see: https://docs.expo.dev/technical-specs/expo-updates-1/
  //
  // TODO: Support `expo-expect-signature` header for signed manifests.
  //       When the client sends this header, the response should include
  //       a signature in the `expo-signature` header or as part of a
  //       multipart response. For now, we return unsigned JSON.

  const responseHeaders: Record<string, string> = {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
    // Cache for 60s at CDN/browser, but allow revalidation
    "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600",
  };

  // Echo back platform header so the client can verify
  responseHeaders["expo-manifest-filters"] = `platform="${platform}"`;

  return {
    statusCode: 200,
    headers: responseHeaders,
    body: JSON.stringify(manifest),
  };
}
