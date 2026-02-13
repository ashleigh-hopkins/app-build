# Contributing to app-build

Thanks for your interest in contributing to `app-build`. This guide covers how to set up the project, run tests, and submit changes.

---

## Prerequisites

- **Node.js 20+** (the action runs on `node20`)
- **Ruby 3.x** (for Fastlane -- macOS includes this)
- **Git**

Optional (for full integration testing):

- **Xcode 16.1+** (iOS builds, macOS only)
- **Android SDK** (Android builds)
- **CocoaPods** (`gem install cocoapods`)

---

## Setup

```bash
git clone https://github.com/ashleigh-hopkins/app-build.git
cd app-build
npm install
```

---

## Running Tests

Unit tests use Jest with `ts-jest`. All `@actions/*` packages are mocked via `__mocks__/`.

```bash
# Run all tests
npx jest --no-coverage

# Run tests with coverage
npx jest --coverage

# Run a specific test file
npx jest __tests__/config/parser.test.ts

# Run tests matching a pattern
npx jest --testPathPattern="ios"
```

There are currently 364 unit tests across 22 suites.

---

## Building

The action is bundled with `@vercel/ncc` into a single file for GitHub Actions.

```bash
# Type-check only (does not emit bundled output)
npx tsc --noEmit

# Bundle the main entry point
npx ncc build src/index.ts -o dist --source-map --license licenses.txt

# Bundle the cleanup (post-step) entry point
npx ncc build src/cleanup.ts -o dist/cleanup --source-map
```

Both entry points must be built -- `dist/index.js` is the main action and `dist/cleanup/index.js` runs as the post-step.

---

## Project Structure

```
src/
├── index.ts                    # Orchestrator — routes to Android/iOS/OTA pipeline
├── cleanup.ts                  # Post-step entry point
├── config/
│   ├── schema.ts               # Zod schema for app-build.json
│   ├── parser.ts               # Config + action input merger → ResolvedConfig
│   └── defaults.ts             # Default values
├── setup/
│   ├── node.ts                 # Node.js version check + package manager detection
│   ├── ruby.ts                 # Ruby + Bundler + Fastlane setup
│   ├── android-sdk.ts          # ANDROID_HOME detection + local.properties
│   └── cache.ts                # @actions/cache restore/save
├── prebuild/
│   ├── expo.ts                 # npx expo prebuild + verify
│   └── pods.ts                 # pod install
├── credentials/
│   ├── android-keystore.ts     # Keystore decode + gradle.properties
│   ├── ios-keychain.ts         # Temp keychain + cert + profile
│   ├── ios-match.ts            # Fastlane match (readonly)
│   └── asc-api-key.ts          # ASC .p8 key + JSON
├── build/
│   ├── android.ts              # Fastlane gradle → AAB/APK
│   └── ios.ts                  # Fastlane gym → IPA
├── submit/
│   ├── google-play.ts          # Fastlane supply
│   └── app-store.ts            # Fastlane pilot
├── ota/
│   ├── export.ts               # npx expo export
│   ├── manifest.ts             # expo-updates manifest generation
│   └── upload.ts               # S3/GCS/custom upload
├── version/
│   └── bump.ts                 # buildNumber/versionCode increment
└── utils/
    ├── exec.ts                 # Shell command runner
    ├── secrets.ts              # Base64 decode + masking
    ├── cleanup.ts              # Cleanup registry
    ├── artifacts.ts            # Artifact finder + uploader
    └── fastfile.ts             # Fastfile template generator
```

Test files mirror this structure under `__tests__/`.

---

## Testing Locally

The `scripts/` directory contains helper scripts for local integration testing:

| Script | Purpose |
|--------|---------|
| `scripts/test-local-ios.sh` | iOS prebuild + pod install + simulator build on macOS |
| `scripts/test-local-ota.sh` | OTA export + manifest generation |
| `scripts/test-act-android.sh` | Android build via [act](https://github.com/nektos/act) in Docker |

These scripts use the test fixture repo at [ashleigh-hopkins/app-build-test-fixture](https://github.com/ashleigh-hopkins/app-build-test-fixture), which is an Expo SDK 54 app with a widget extension.

---

## Testing on Real CI

The test fixture repo has CI workflows that reference this action:

- `test-android.yml` -- Android build on `ubuntu-latest`
- `test-ios.yml` -- iOS build on `macos-15`
- `test-ota.yml` -- OTA export on `ubuntu-latest`

To test your changes on real CI, push your branch and update the fixture workflow to point at your branch:

```yaml
- uses: ashleigh-hopkins/app-build@your-branch
```

---

## Code Style

- **TypeScript** -- strict mode, ES2022 target
- **Formatting** -- Prettier (`npx prettier --check 'src/**/*.ts' '__tests__/**/*.ts'`)
- **Linting** -- ESLint (`npx eslint src/ __tests__/`)
- No dead code -- if something is unused, delete it
- No over-engineering -- keep solutions minimal and focused
- Every function should have a corresponding test

---

## Pull Request Guidelines

1. **Run tests before submitting**: `npx jest --no-coverage`
2. **Build both entry points** and verify no TypeScript errors: `npx tsc --noEmit`
3. **Keep PRs focused** -- one logical change per PR
4. **Write descriptive commit messages** explaining what changed and why
5. **Add tests** for any new functionality
6. **Don't commit `dist/`** unless you've rebuilt it -- the bundled output is checked in so GitHub Actions can find the entry point
7. **Don't commit `.env`** or any secrets

---

## Node.js Version

The action uses `node20` as its runtime (set in `action.yml`). If your project needs a specific Node.js version, use `actions/setup-node` in your workflow before this action:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: '20'
  - uses: ashleigh-hopkins/app-build@v1
    with:
      platform: ios
```

The `node-version` input on the action itself currently only checks the major version and warns on mismatch -- it does not install a different version.

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
