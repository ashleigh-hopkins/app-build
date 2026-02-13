# OTA Manifest Server — Cloudflare Worker

Reference implementation for serving [Expo Updates protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/) manifests using a Cloudflare Worker with R2 (or external S3) storage.

## How it works

1. The `app-build` GitHub Action exports your Expo app and uploads the bundle, assets, and `manifest.json` to cloud storage (S3, GCS, or R2).
2. This Cloudflare Worker reads `manifest.json` from R2 (or S3) for the requested `platform` + `runtimeVersion` and returns it with the correct expo-updates headers.
3. Your Expo app fetches the manifest from this endpoint to check for and download OTA updates.

## Storage layout

The Worker expects manifests at:

```
<PREFIX>/<runtimeVersion>/<platform>/manifest.json
```

For example (in R2):

```
updates/1.0.0/ios/manifest.json
updates/1.0.0/android/manifest.json
```

Asset URLs inside the manifest are absolute — they already point to your public storage URL as configured during the upload step.

## Setup

### Prerequisites

- Cloudflare account
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) v3+
- Node.js 18+

### 1. Install Wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. Choose a storage backend

#### Option A: Cloudflare R2 (recommended)

R2 is S3-compatible and integrates natively with Workers.

```bash
# Create a bucket
wrangler r2 bucket create ota-updates
```

Then uncomment the R2 binding in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "OTA_BUCKET"
bucket_name = "ota-updates"
```

To upload your OTA files to R2, you can use the S3-compatible API. Get your R2 credentials from the Cloudflare dashboard (R2 > Manage R2 API Tokens) and use the AWS CLI:

```bash
aws s3 sync ./dist s3://ota-updates/updates/1.0.0/ios/ \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

Or configure `app-build` to use R2 as a custom upload target.

#### Option B: External S3

If your OTA files are already in AWS S3, set environment variables instead:

```toml
[vars]
S3_ENDPOINT = "https://s3.us-east-1.amazonaws.com"
S3_BUCKET   = "my-ota-bucket"
OTA_PREFIX  = "updates"
```

For private buckets, store credentials as secrets:

```bash
wrangler secret put S3_ACCESS_KEY_ID
wrangler secret put S3_SECRET_ACCESS_KEY
```

> Note: The current implementation uses unsigned requests for S3.
> For private buckets, you'll need to add AWS Signature V4 signing
> (e.g., using the `aws4fetch` npm package).

### 3. Deploy

```bash
wrangler deploy
```

This gives you a URL like `https://ota-manifest.<your-subdomain>.workers.dev`.

### 4. Custom domain (optional)

Uncomment the routes section in `wrangler.toml`:

```toml
routes = [
  { pattern = "ota.example.com/api/manifest", zone_name = "example.com" }
]
```

Then redeploy:

```bash
wrangler deploy
```

## Usage

Configure your Expo app to use this endpoint:

```json
// app.json
{
  "expo": {
    "updates": {
      "url": "https://ota-manifest.<your-subdomain>.workers.dev/?platform={{platform}}&runtimeVersion={{runtimeVersion}}",
      "enabled": true
    },
    "runtimeVersion": "1.0.0"
  }
}
```

The client sends requests like:

```
GET /?platform=ios&runtimeVersion=1.0.0
```

### Request headers from the client

| Header | Description |
|--------|-------------|
| `expo-platform` | `ios` or `android` (also sent as query param) |
| `expo-runtime-version` | Current runtime version |
| `expo-expect-signature` | If present, client expects a signed manifest |

### Response headers

| Header | Value |
|--------|-------|
| `expo-protocol-version` | `1` |
| `expo-sfv-version` | `0` |
| `cache-control` | `public, max-age=60, s-maxage=120, stale-while-revalidate=600` |

## Development

```bash
wrangler dev
```

This starts a local server. Note: R2 bindings are available locally via `--persist` mode.

## Customization

### Signed manifests

The current implementation returns unsigned manifests. To add code signing:

1. Generate an RSA key pair
2. Store the private key as a Worker secret: `wrangler secret put SIGNING_PRIVATE_KEY`
3. Sign the manifest JSON with the private key using the Web Crypto API
4. Return the signature in the `expo-signature` response header

See the [Expo code signing docs](https://docs.expo.dev/eas-update/code-signing/) for the signature format.

### Asset serving through the Worker

If you want to serve assets through the Worker as well (instead of directly from R2/S3), add a route that proxies asset requests to your storage backend. This is useful for adding authentication or custom headers to asset downloads.
