import { type AppBuildConfig, type IosBuildConfig, type AndroidBuildConfig, type SubmitConfig, type SigningConfig, type UpdatesConfig, type VersionConfig } from './schema';
export interface ActionInputs {
    platform: 'ios' | 'android';
    profile: string;
    submit: boolean;
    ota: boolean;
    versionBump: boolean;
    cache: boolean;
    nodeVersion: string;
    fastlaneVersion: string;
    iosCertificateP12?: string;
    iosCertificatePassword?: string;
    iosProvisioningProfile?: string;
    iosExtensionProfiles?: string;
    matchPassword?: string;
    matchGitPrivateKey?: string;
    ascApiKeyId?: string;
    ascApiIssuerId?: string;
    ascApiKeyP8?: string;
    androidKeystore?: string;
    androidKeystorePassword?: string;
    androidKeyAlias?: string;
    androidKeyPassword?: string;
    googlePlayServiceAccount?: string;
}
export interface ResolvedConfig {
    platform: 'ios' | 'android';
    profile: string;
    ios?: IosBuildConfig;
    android?: AndroidBuildConfig;
    submit: boolean;
    ota: boolean;
    versionBump: boolean;
    cache: boolean;
    nodeVersion: string;
    fastlaneVersion: string;
    submitConfig?: SubmitConfig;
    signingConfig?: SigningConfig;
    updatesConfig?: UpdatesConfig;
    versionConfig?: VersionConfig;
    credentials: {
        iosCertificateP12?: string;
        iosCertificatePassword?: string;
        iosProvisioningProfile?: string;
        iosExtensionProfiles?: string;
        matchPassword?: string;
        matchGitPrivateKey?: string;
        ascApiKeyId?: string;
        ascApiIssuerId?: string;
        ascApiKeyP8?: string;
        androidKeystore?: string;
        androidKeystorePassword?: string;
        androidKeyAlias?: string;
        androidKeyPassword?: string;
        googlePlayServiceAccount?: string;
    };
}
export declare function parseConfigFile(configPath: string): Promise<AppBuildConfig>;
export declare function getProfileConfig(config: AppBuildConfig, profileName: string, platform: 'ios' | 'android'): IosBuildConfig | AndroidBuildConfig;
export declare function mergeActionInputs(config: AppBuildConfig, inputs: ActionInputs): ResolvedConfig;
//# sourceMappingURL=parser.d.ts.map