# app-build

Fully self-hosted GitHub Action for Expo/React Native build, submit, and OTA updates.

Zero Expo server dependency. No account, no token, no vendor lock-in.

<!-- badges -->
<!-- [![CI](https://github.com/your-org/app-build/actions/workflows/test.yml/badge.svg)](https://github.com/your-org/app-build/actions/workflows/test.yml) -->
<!-- [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-app--build-blue)](https://github.com/marketplace/actions/app-build) -->
<!-- [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE) -->

---

## Features

- **Zero Expo server dependency** -- no account, no token, no vendor lock-in
- **Builds via Fastlane** -- `gym` for iOS, `gradle` for Android -- battle-tested, MIT-licensed
- **Store submission via Fastlane** -- `deliver`/`pilot` for iOS, `supply` for Android
- **OTA updates** via the `expo-updates` protocol to a self-hosted CDN (S3, GCS, or custom)
- **Credentials from GitHub Secrets** -- you control your own signing keys
- **Build profiles** -- development, preview, and production configurations in one file
- **iOS signing** via manual keychain import or Fastlane `match`
- **Automatic version bumping** -- increments `buildNumber` / `versionCode` per build

---

## Quick Start

### iOS

```yaml
name: Build iOS
on: push

jobs:
  build:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: ios
          ios-certificate-p12: ${{ secrets.IOS_CERTIFICATE_P12 }}
          ios-certificate-password: ${{ secrets.IOS_CERTIFICATE_PASSWORD }}
          ios-provisioning-profile: ${{ secrets.IOS_PROVISIONING_PROFILE }}
```

### Android

```yaml
name: Build Android
on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: android
          android-keystore: ${{ secrets.ANDROID_KEYSTORE }}
          android-keystore-password: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          android-key-alias: ${{ secrets.ANDROID_KEY_ALIAS }}
          android-key-password: ${{ secrets.ANDROID_KEY_PASSWORD }}
```

> **Node.js version**: The action checks the installed Node.js major version against the `node-version` input (default `20`) but does not install a different version. If you need a specific version, add [`actions/setup-node`](https://github.com/actions/setup-node) before this action in your workflow.

---

## Configuration

All configuration lives in a single file: `app-build.json` in your project root.

### Full Example

```json
{
  "build": {
    "development": {
      "ios": {
        "scheme": "MyApp",
        "buildConfiguration": "Debug",
        "exportMethod": "development"
      },
      "android": {
        "buildType": "debug"
      }
    },
    "preview": {
      "ios": {
        "scheme": "MyApp",
        "buildConfiguration": "Release",
        "exportMethod": "ad-hoc"
      },
      "android": {
        "buildType": "release"
      }
    },
    "production": {
      "ios": {
        "scheme": "MyApp",
        "buildConfiguration": "Release",
        "exportMethod": "app-store"
      },
      "android": {
        "buildType": "release",
        "aab": true
      }
    }
  },
  "submit": {
    "ios": {
      "ascAppId": "1234567890"
    },
    "android": {
      "packageName": "com.example.myapp",
      "track": "internal"
    }
  },
  "signing": {
    "ios": {
      "method": "manual"
    },
    "android": {
      "method": "manual"
    }
  },
  "updates": {
    "enabled": true,
    "url": "https://updates.example.com/api/manifest",
    "storage": {
      "type": "s3",
      "bucket": "my-app-updates",
      "region": "us-east-1",
      "prefix": "updates/"
    }
  },
  "version": {
    "autoIncrement": true,
    "source": "app.json"
  }
}
```

### Sections

**`build`** -- Defines build profiles. Each profile (`development`, `preview`, `production`) contains per-platform settings. The `profile` action input selects which profile to use (default: `production`).

- **iOS fields**: `scheme` (Xcode scheme), `buildConfiguration` (`Debug` or `Release`), `exportMethod` (`development`, `ad-hoc`, `enterprise`, `app-store`).
- **Android fields**: `buildType` (`debug` or `release`), `aab` (`true` to produce an AAB instead of APK).

**`submit`** -- Store submission configuration.

- **iOS**: `ascAppId` -- your App Store Connect app ID.
- **Android**: `packageName` -- your app's package name. `track` -- Play Store track (`internal`, `alpha`, `beta`, `production`).

**`signing`** -- Signing method per platform.

- **iOS**: `method` is `manual` (default) or `match`. When using `match`, additional fields apply: `type` (`appstore`, `adhoc`, `development`), `storage` (`git`, `s3`, `google_cloud`), `gitUrl`, `readonly`.
- **Android**: `method` is `manual` (default). Keystore credentials are passed via action inputs.

**`updates`** -- OTA update configuration.

- `enabled` -- whether OTA is configured for this project.
- `url` -- the manifest URL your app checks for updates.
- `storage` -- where exported bundles are uploaded. Supported types: `s3`, `gcs`, `custom`.

**`version`** -- Version auto-increment settings.

- `autoIncrement` -- whether to increment build numbers automatically.
- `source` -- where version info is read from (currently `app.json`).

---

## Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `platform` | Target platform: `ios` or `android` | Yes | -- |
| `profile` | Build profile from `app-build.json` | No | `production` |
| `config` | Path to `app-build.json` config file | No | `./app-build.json` |
| `submit` | Submit to App Store / Google Play after build | No | `false` |
| `ota` | Export an OTA update instead of a full native build | No | `false` |
| `version-bump` | Auto-increment build number (iOS `buildNumber` / Android `versionCode`) | No | `false` |
| `cache` | Cache `node_modules`, CocoaPods, Gradle, and Ruby gems | No | `true` |
| `node-version` | Node.js version to use | No | `20` |
| `fastlane-version` | Fastlane version to install (`latest` for most recent) | No | `latest` |
| `ios-certificate-p12` | Base64-encoded iOS distribution certificate (`.p12`) | No | -- |
| `ios-certificate-password` | Password for the iOS distribution certificate | No | -- |
| `ios-provisioning-profile` | Base64-encoded iOS provisioning profile (`.mobileprovision`) | No | -- |
| `match-password` | Fastlane `match` encryption passphrase | No | -- |
| `match-git-private-key` | Base64-encoded SSH private key for the `match` git repository | No | -- |
| `asc-api-key-id` | App Store Connect API Key ID | No | -- |
| `asc-api-issuer-id` | App Store Connect API Issuer ID | No | -- |
| `asc-api-key-p8` | Base64-encoded App Store Connect API key (`.p8`) | No | -- |
| `android-keystore` | Base64-encoded Android upload keystore (`.jks` / `.keystore`) | No | -- |
| `android-keystore-password` | Password for the Android keystore | No | -- |
| `android-key-alias` | Key alias within the Android keystore | No | -- |
| `android-key-password` | Password for the Android key | No | -- |
| `google-play-service-account` | Base64-encoded Google Play service account JSON key | No | -- |

---

## Action Outputs

| Output | Description |
|--------|-------------|
| `artifact-path` | Path to the build artifact (`.ipa`, `.aab`, or `.apk`) |
| `build-number` | Build number used (iOS `buildNumber` or Android `versionCode`) |
| `submission-status` | Store submission result: `submitted`, `skipped`, or `failed` |
| `ota-update-id` | OTA update UUID (only set when `ota` is `true`) |
| `ota-manifest-url` | OTA manifest URL (only set when `ota` is `true`) |

---

## Credential Setup

All credentials are passed as GitHub Secrets. Binary files (certificates, keystores, keys) must be base64-encoded before storing as secrets.

To base64-encode any file:

```bash
cat file | base64
```

### iOS Manual Signing

You need a distribution certificate (`.p12`) and a provisioning profile (`.mobileprovision`).

1. **Export the certificate from Keychain Access**: Open Keychain Access, find your Apple Distribution certificate, right-click, choose "Export...", save as `.p12`, set a password.
2. **Download the provisioning profile** from the [Apple Developer Portal](https://developer.apple.com/account/resources/profiles/list).
3. **Base64-encode both files**:

```bash
cat MyDistributionCert.p12 | base64
cat MyApp.mobileprovision | base64
```

4. Store as GitHub Secrets:
   - `IOS_CERTIFICATE_P12` -- base64-encoded `.p12`
   - `IOS_CERTIFICATE_PASSWORD` -- the password you set during export
   - `IOS_PROVISIONING_PROFILE` -- base64-encoded `.mobileprovision`

### iOS Match Signing

Fastlane `match` stores certificates and profiles in a shared repository (git, S3, or GCS), encrypted with a passphrase. This is better for teams.

1. **Initialize match** locally (one-time setup):

```bash
fastlane match init
```

Choose your storage backend (`git`, `s3`, or `google_cloud`) and follow the prompts.

2. **Generate certificates** (one-time per type):

```bash
fastlane match appstore
```

3. **Configure `app-build.json`**:

```json
{
  "signing": {
    "ios": {
      "method": "match",
      "type": "appstore",
      "storage": "git",
      "gitUrl": "git@github.com:myorg/certificates.git",
      "readonly": true
    }
  }
}
```

4. Store as GitHub Secrets:
   - `MATCH_PASSWORD` -- the encryption passphrase
   - `MATCH_GIT_PRIVATE_KEY` -- base64-encoded SSH private key with read access to the match repo

The action always runs `match` in readonly mode to prevent race conditions in CI.

### App Store Connect API Key

Required for submitting to the App Store / TestFlight.

1. Go to [App Store Connect > Users and Access > Integrations > App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api).
2. Click the "+" button to generate a new key. Select the "App Manager" role (or "Admin").
3. Download the `.p8` key file. **You can only download it once.**
4. Note the **Key ID** and **Issuer ID** from the page.
5. **Base64-encode the key**:

```bash
cat AuthKey_XXXXXXXXXX.p8 | base64
```

6. Store as GitHub Secrets:
   - `ASC_API_KEY_ID` -- the Key ID (plain text)
   - `ASC_API_ISSUER_ID` -- the Issuer ID (plain text)
   - `ASC_API_KEY_P8` -- base64-encoded `.p8` file

### Android Keystore

Required for signing Android builds.

1. **Create an upload keystore** (if you don't have one):

```bash
keytool -genkeypair -v -storetype JKS \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOUR_STORE_PASSWORD \
  -keypass YOUR_KEY_PASSWORD \
  -alias upload \
  -keystore upload.keystore \
  -dname "CN=Your Name, OU=Your Org, O=Your Company, L=City, ST=State, C=US"
```

2. **Base64-encode the keystore**:

```bash
cat upload.keystore | base64
```

3. Store as GitHub Secrets:
   - `ANDROID_KEYSTORE` -- base64-encoded `.keystore` / `.jks`
   - `ANDROID_KEYSTORE_PASSWORD` -- the store password
   - `ANDROID_KEY_ALIAS` -- the alias (e.g. `upload`)
   - `ANDROID_KEY_PASSWORD` -- the key password

### Google Play Service Account

Required for submitting to Google Play.

1. Go to the [Google Play Console > Setup > API access](https://play.google.com/console/developers).
2. Under "Service accounts", click "Create new service account".
3. Follow the link to Google Cloud Console. Create a service account with no special roles.
4. Back in Play Console, grant the service account "Release manager" access to your app.
5. In Google Cloud Console, go to the service account, create a JSON key, and download it.
6. **Base64-encode the JSON key**:

```bash
cat service-account.json | base64
```

7. Store as GitHub Secret:
   - `GOOGLE_PLAY_SERVICE_ACCOUNT` -- base64-encoded JSON key

---

## Example Workflows

### Production Build + Submit (Both Platforms)

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: ios
          submit: true
          version-bump: true
          ios-certificate-p12: ${{ secrets.IOS_CERTIFICATE_P12 }}
          ios-certificate-password: ${{ secrets.IOS_CERTIFICATE_PASSWORD }}
          ios-provisioning-profile: ${{ secrets.IOS_PROVISIONING_PROFILE }}
          asc-api-key-id: ${{ secrets.ASC_API_KEY_ID }}
          asc-api-issuer-id: ${{ secrets.ASC_API_ISSUER_ID }}
          asc-api-key-p8: ${{ secrets.ASC_API_KEY_P8 }}

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: android
          submit: true
          version-bump: true
          android-keystore: ${{ secrets.ANDROID_KEYSTORE }}
          android-keystore-password: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          android-key-alias: ${{ secrets.ANDROID_KEY_ALIAS }}
          android-key-password: ${{ secrets.ANDROID_KEY_PASSWORD }}
          google-play-service-account: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT }}
```

### iOS with Fastlane Match

```yaml
jobs:
  build-ios:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: ios
          submit: true
          match-password: ${{ secrets.MATCH_PASSWORD }}
          match-git-private-key: ${{ secrets.MATCH_GIT_PRIVATE_KEY }}
          asc-api-key-id: ${{ secrets.ASC_API_KEY_ID }}
          asc-api-issuer-id: ${{ secrets.ASC_API_ISSUER_ID }}
          asc-api-key-p8: ${{ secrets.ASC_API_KEY_P8 }}
```

### OTA Update on Push to Main

```yaml
name: OTA Update
on:
  push:
    branches: [main]

jobs:
  ota:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: your-org/app-build@v1
        with:
          platform: both
          ota: true
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## OTA Updates

The `expo-updates` library (open-source, MIT) checks a configured URL on app launch. If a new manifest is available with a matching `runtimeVersion`, it downloads the updated JS bundle and assets. No Expo server is involved -- it is a standard HTTP protocol.

When `ota: true`, the action:

1. Runs `npx expo export` to generate the JS bundle and assets.
2. Generates a manifest following the `expo-updates` protocol.
3. Uploads the bundle and assets to your configured storage backend (S3, GCS, or custom).
4. Uploads the manifest to your manifest endpoint.

Your app's `updates.url` in `app.json` points to your own server. For anything beyond a single platform/runtimeVersion, you need a thin manifest server that reads the `expo-platform` and `expo-runtime-version` request headers and routes to the correct manifest.

Expo provides a reference implementation: [custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server).

### Storage Backends

| Backend | Config Type | Upload Method |
|---------|-------------|---------------|
| AWS S3 | `s3` | `aws s3 sync` |
| Google Cloud Storage | `gcs` | `gsutil rsync` |
| Custom | `custom` | User-provided `uploadCommand` |

---

## Cost Comparison

| Monthly Volume | EAS Build | app-build (GitHub Actions) |
|----------------|-----------|----------------------------|
| 20 builds (10 iOS + 10 Android) | $0 (free tier) | ~$13.00 |
| 50 builds (25 iOS + 25 Android) | $19/month+ | ~$32.50 |
| 100 builds (50 iOS + 50 Android) | $99/month+ | ~$65.00 |
| 200 builds (100 iOS + 100 Android) | $199/month+ | ~$130.00 |

**Per-build costs on GitHub Actions:**
- Android build (~10 min on `ubuntu-latest`): ~$0.06
- iOS build (~20 min on `macos-14`): ~$1.24
- OTA update (~2 min on `ubuntu-latest`): ~$0.012

GitHub Free plan includes 2,000 minutes/month (macOS uses a 10x multiplier, so ~200 effective macOS minutes).

At low volume, the EAS free tier wins on cost. At scale, `app-build` is cheaper and has no build count limits. `app-build` provides full infrastructure control and zero vendor dependency at any volume.

---

## Troubleshooting

### iOS scheme not shared

**Symptom**: `xcodebuild` fails with "scheme not found".

**Cause**: The Xcode scheme is not marked as "Shared". By default, schemes are user-specific.

**Fix**: In Xcode, go to Product > Scheme > Manage Schemes, check the "Shared" checkbox for your scheme, and commit the `.xcscheme` file under `ios/MyApp.xcodeproj/xcshareddata/xcschemes/`.

### First Google Play upload must be manual

**Symptom**: Fastlane `supply` fails with HTTP 403 on the first upload.

**Cause**: Google Play requires the very first APK/AAB to be uploaded manually through the Play Console. The API cannot create a new app listing.

**Fix**: Upload your first build manually via the [Google Play Console](https://play.google.com/console). All subsequent uploads can be automated via this action.

### CocoaPods version mismatch

**Symptom**: `pod install` fails with version conflicts or "The version of CocoaPods used to generate the lockfile is incompatible."

**Cause**: `Podfile.lock` was generated with a different CocoaPods version than what the runner has installed.

**Fix**: Either update `Podfile.lock` locally with the same CocoaPods version used in CI, or run `pod repo update` before install. If you have a `Gemfile` in your project that pins CocoaPods, the action will use it via `bundle exec pod install`.

### Fastlane match race condition

**Symptom**: Concurrent builds fail when trying to access or modify the match certificate store.

**Cause**: Multiple CI jobs running `match` in write mode simultaneously can corrupt the certificate store.

**Fix**: The action always runs `match` with `readonly: true`. Certificates and profiles should be generated locally or in a dedicated setup job, never during concurrent CI builds.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing, and PR guidelines.

---

## License

MIT
