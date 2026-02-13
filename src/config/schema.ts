import { z } from 'zod';

// ---------------------------------------------------------------------------
// Sub-schemas — iOS / Android build config per profile
// ---------------------------------------------------------------------------

export const IosBuildConfigSchema = z.object({
  scheme: z.string(),
  buildConfiguration: z.string(),
  exportMethod: z.enum(['development', 'ad-hoc', 'app-store', 'enterprise']),
});

export type IosBuildConfig = z.infer<typeof IosBuildConfigSchema>;

export const AndroidBuildConfigSchema = z.object({
  buildType: z.enum(['debug', 'release']),
  aab: z.boolean().optional(),
});

export type AndroidBuildConfig = z.infer<typeof AndroidBuildConfigSchema>;

// ---------------------------------------------------------------------------
// Build profile — at least one platform must be configured
// ---------------------------------------------------------------------------

export const BuildProfileSchema = z.object({
  ios: IosBuildConfigSchema.optional(),
  android: AndroidBuildConfigSchema.optional(),
});

export type BuildProfile = z.infer<typeof BuildProfileSchema>;

// ---------------------------------------------------------------------------
// Submit config
// ---------------------------------------------------------------------------

export const SubmitConfigSchema = z.object({
  ios: z
    .object({
      ascAppId: z.string(),
    })
    .optional(),
  android: z
    .object({
      packageName: z.string(),
      track: z.enum(['internal', 'alpha', 'beta', 'production']),
    })
    .optional(),
});

export type SubmitConfig = z.infer<typeof SubmitConfigSchema>;

// ---------------------------------------------------------------------------
// Signing config
// ---------------------------------------------------------------------------

const IosSigningManualSchema = z.object({
  method: z.literal('manual'),
});

const IosSigningMatchSchema = z.object({
  method: z.literal('match'),
  type: z.enum(['appstore', 'adhoc', 'development']).optional(),
  storage: z.enum(['git', 's3', 'google_cloud']).optional(),
  gitUrl: z.string().optional(),
  readonly: z.boolean().optional(),
});

const IosSigningSchema = z.union([IosSigningManualSchema, IosSigningMatchSchema]);

const AndroidSigningSchema = z.object({
  method: z.literal('manual'),
});

export const SigningConfigSchema = z.object({
  ios: IosSigningSchema.optional(),
  android: AndroidSigningSchema.optional(),
});

export type SigningConfig = z.infer<typeof SigningConfigSchema>;

// ---------------------------------------------------------------------------
// OTA updates config
// ---------------------------------------------------------------------------

const UpdatesStorageSchema = z.object({
  type: z.enum(['s3', 'gcs', 'custom']),
  bucket: z.string().optional(),
  region: z.string().optional(),
  prefix: z.string().optional(),
  uploadCommand: z.string().optional(),
});

export const UpdatesConfigSchema = z.object({
  enabled: z.boolean(),
  url: z.string().optional(),
  storage: UpdatesStorageSchema.optional(),
});

export type UpdatesConfig = z.infer<typeof UpdatesConfigSchema>;

// ---------------------------------------------------------------------------
// Version config
// ---------------------------------------------------------------------------

export const VersionStrategySchema = z.enum([
  'app-json',
  'git-tag',
  'git-commit-count',
  'timestamp',
]);

export type VersionStrategy = z.infer<typeof VersionStrategySchema>;

export const VersionConfigSchema = z.object({
  autoIncrement: z.boolean(),
  source: z.string().optional(),
  strategy: VersionStrategySchema.optional(),
  gitTagPattern: z.string().optional(),
});

export type VersionConfig = z.infer<typeof VersionConfigSchema>;

// ---------------------------------------------------------------------------
// Top-level app-build.json schema
// ---------------------------------------------------------------------------

export const AppBuildConfigSchema = z.object({
  build: z.record(z.string(), BuildProfileSchema),
  submit: SubmitConfigSchema.optional(),
  signing: SigningConfigSchema.optional(),
  updates: UpdatesConfigSchema.optional(),
  version: VersionConfigSchema.optional(),
});

export type AppBuildConfig = z.infer<typeof AppBuildConfigSchema>;
