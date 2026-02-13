import { z } from 'zod';
export declare const IosBuildConfigSchema: z.ZodObject<{
    scheme: z.ZodString;
    buildConfiguration: z.ZodEnum<{
        Debug: "Debug";
        Release: "Release";
    }>;
    exportMethod: z.ZodEnum<{
        development: "development";
        "ad-hoc": "ad-hoc";
        "app-store": "app-store";
        enterprise: "enterprise";
    }>;
}, z.core.$strip>;
export type IosBuildConfig = z.infer<typeof IosBuildConfigSchema>;
export declare const AndroidBuildConfigSchema: z.ZodObject<{
    buildType: z.ZodEnum<{
        debug: "debug";
        release: "release";
    }>;
    aab: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AndroidBuildConfig = z.infer<typeof AndroidBuildConfigSchema>;
export declare const BuildProfileSchema: z.ZodObject<{
    ios: z.ZodOptional<z.ZodObject<{
        scheme: z.ZodString;
        buildConfiguration: z.ZodEnum<{
            Debug: "Debug";
            Release: "Release";
        }>;
        exportMethod: z.ZodEnum<{
            development: "development";
            "ad-hoc": "ad-hoc";
            "app-store": "app-store";
            enterprise: "enterprise";
        }>;
    }, z.core.$strip>>;
    android: z.ZodOptional<z.ZodObject<{
        buildType: z.ZodEnum<{
            debug: "debug";
            release: "release";
        }>;
        aab: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BuildProfile = z.infer<typeof BuildProfileSchema>;
export declare const SubmitConfigSchema: z.ZodObject<{
    ios: z.ZodOptional<z.ZodObject<{
        ascAppId: z.ZodString;
    }, z.core.$strip>>;
    android: z.ZodOptional<z.ZodObject<{
        packageName: z.ZodString;
        track: z.ZodEnum<{
            production: "production";
            internal: "internal";
            alpha: "alpha";
            beta: "beta";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SubmitConfig = z.infer<typeof SubmitConfigSchema>;
export declare const SigningConfigSchema: z.ZodObject<{
    ios: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        method: z.ZodLiteral<"manual">;
    }, z.core.$strip>, z.ZodObject<{
        method: z.ZodLiteral<"match">;
        type: z.ZodOptional<z.ZodEnum<{
            development: "development";
            appstore: "appstore";
            adhoc: "adhoc";
        }>>;
        storage: z.ZodOptional<z.ZodEnum<{
            git: "git";
            s3: "s3";
            google_cloud: "google_cloud";
        }>>;
        gitUrl: z.ZodOptional<z.ZodString>;
        readonly: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>]>>;
    android: z.ZodOptional<z.ZodObject<{
        method: z.ZodLiteral<"manual">;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SigningConfig = z.infer<typeof SigningConfigSchema>;
export declare const UpdatesConfigSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    url: z.ZodOptional<z.ZodString>;
    storage: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<{
            s3: "s3";
            custom: "custom";
            gcs: "gcs";
        }>;
        bucket: z.ZodOptional<z.ZodString>;
        region: z.ZodOptional<z.ZodString>;
        prefix: z.ZodOptional<z.ZodString>;
        uploadCommand: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type UpdatesConfig = z.infer<typeof UpdatesConfigSchema>;
export declare const VersionConfigSchema: z.ZodObject<{
    autoIncrement: z.ZodBoolean;
    source: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type VersionConfig = z.infer<typeof VersionConfigSchema>;
export declare const AppBuildConfigSchema: z.ZodObject<{
    build: z.ZodRecord<z.ZodString, z.ZodObject<{
        ios: z.ZodOptional<z.ZodObject<{
            scheme: z.ZodString;
            buildConfiguration: z.ZodEnum<{
                Debug: "Debug";
                Release: "Release";
            }>;
            exportMethod: z.ZodEnum<{
                development: "development";
                "ad-hoc": "ad-hoc";
                "app-store": "app-store";
                enterprise: "enterprise";
            }>;
        }, z.core.$strip>>;
        android: z.ZodOptional<z.ZodObject<{
            buildType: z.ZodEnum<{
                debug: "debug";
                release: "release";
            }>;
            aab: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    submit: z.ZodOptional<z.ZodObject<{
        ios: z.ZodOptional<z.ZodObject<{
            ascAppId: z.ZodString;
        }, z.core.$strip>>;
        android: z.ZodOptional<z.ZodObject<{
            packageName: z.ZodString;
            track: z.ZodEnum<{
                production: "production";
                internal: "internal";
                alpha: "alpha";
                beta: "beta";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    signing: z.ZodOptional<z.ZodObject<{
        ios: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
            method: z.ZodLiteral<"manual">;
        }, z.core.$strip>, z.ZodObject<{
            method: z.ZodLiteral<"match">;
            type: z.ZodOptional<z.ZodEnum<{
                development: "development";
                appstore: "appstore";
                adhoc: "adhoc";
            }>>;
            storage: z.ZodOptional<z.ZodEnum<{
                git: "git";
                s3: "s3";
                google_cloud: "google_cloud";
            }>>;
            gitUrl: z.ZodOptional<z.ZodString>;
            readonly: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>]>>;
        android: z.ZodOptional<z.ZodObject<{
            method: z.ZodLiteral<"manual">;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    updates: z.ZodOptional<z.ZodObject<{
        enabled: z.ZodBoolean;
        url: z.ZodOptional<z.ZodString>;
        storage: z.ZodOptional<z.ZodObject<{
            type: z.ZodEnum<{
                s3: "s3";
                custom: "custom";
                gcs: "gcs";
            }>;
            bucket: z.ZodOptional<z.ZodString>;
            region: z.ZodOptional<z.ZodString>;
            prefix: z.ZodOptional<z.ZodString>;
            uploadCommand: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    version: z.ZodOptional<z.ZodObject<{
        autoIncrement: z.ZodBoolean;
        source: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AppBuildConfig = z.infer<typeof AppBuildConfigSchema>;
//# sourceMappingURL=schema.d.ts.map