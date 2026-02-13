# OTA Manifest Server — AWS Lambda

Reference implementation for serving [Expo Updates protocol v1](https://docs.expo.dev/technical-specs/expo-updates-1/) manifests from S3 via AWS Lambda.

## How it works

1. The `app-build` GitHub Action exports your Expo app and uploads the bundle, assets, and `manifest.json` to S3.
2. This Lambda function reads `manifest.json` from S3 for the requested `platform` + `runtimeVersion` and returns it with the correct expo-updates headers.
3. Your Expo app (configured with a custom updates URL) fetches the manifest from this endpoint to check for and download OTA updates.

## S3 layout

The function expects manifests at:

```
s3://<BUCKET>/<PREFIX>/<runtimeVersion>/<platform>/manifest.json
```

For example:

```
s3://my-ota-bucket/updates/1.0.0/ios/manifest.json
s3://my-ota-bucket/updates/1.0.0/android/manifest.json
```

Asset URLs inside the manifest are absolute — they point directly to your S3 bucket (or CloudFront distribution) as configured during the upload step.

## Setup

### Prerequisites

- AWS account with permissions to create Lambda functions and S3 buckets
- Node.js 18+ (Lambda runtime)
- AWS CLI or SAM CLI

### 1. Install dependencies

```bash
npm init -y
npm install @aws-sdk/client-s3
npm install -D typescript @types/node
```

### 2. Compile

```bash
npx tsc handler.ts --outDir dist --target ES2022 --module commonjs \
  --moduleResolution node --esModuleInterop
```

Or add a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "outDir": "dist",
    "esModuleInterop": true,
    "strict": true
  },
  "include": ["handler.ts"]
}
```

### 3. Deploy

#### Option A: AWS Console / CLI

```bash
# Zip the output
cd dist && zip -r ../function.zip . && cd ..

# Create the function
aws lambda create-function \
  --function-name ota-manifest \
  --runtime nodejs18.x \
  --handler handler.handler \
  --zip-file fileb://function.zip \
  --role arn:aws:iam::<ACCOUNT_ID>:role/<LAMBDA_ROLE> \
  --environment "Variables={OTA_BUCKET=my-ota-bucket,OTA_PREFIX=updates}"

# Create a Function URL (simplest public endpoint)
aws lambda create-function-url-config \
  --function-name ota-manifest \
  --auth-type NONE
```

#### Option B: SAM / CloudFormation

```yaml
# template.yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Resources:
  OtaManifestFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: handler.handler
      Runtime: nodejs18.x
      MemorySize: 256
      Timeout: 10
      Environment:
        Variables:
          OTA_BUCKET: !Ref OtaBucket
          OTA_PREFIX: updates
      Policies:
        - S3ReadPolicy:
            BucketName: !Ref OtaBucket
      Events:
        Api:
          Type: HttpApi
          Properties:
            Path: /api/manifest
            Method: GET

  OtaBucket:
    Type: AWS::S3::Bucket
```

```bash
sam build && sam deploy --guided
```

### 4. IAM permissions

The Lambda execution role needs `s3:GetObject` on the OTA bucket:

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetObject"],
  "Resource": "arn:aws:s3:::my-ota-bucket/*"
}
```

## Usage

Once deployed, configure your Expo app to use this endpoint:

```json
// app.json
{
  "expo": {
    "updates": {
      "url": "https://<YOUR_LAMBDA_URL>/api/manifest?platform={{platform}}&runtimeVersion={{runtimeVersion}}",
      "enabled": true
    },
    "runtimeVersion": "1.0.0"
  }
}
```

The client will send requests like:

```
GET /api/manifest?platform=ios&runtimeVersion=1.0.0
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

## Customization

### CloudFront

For production, put CloudFront in front of both the Lambda and the S3 bucket. This gives you:

- Edge caching for manifests and assets
- Custom domain with HTTPS
- Lower latency globally

### Signed manifests

The current implementation returns unsigned manifests. To add code signing:

1. Generate an RSA key pair
2. Store the private key in AWS Secrets Manager or Parameter Store
3. Sign the manifest JSON with the private key
4. Return the signature in the `expo-signature` response header

See the [Expo code signing docs](https://docs.expo.dev/eas-update/code-signing/) for the signature format.
