export interface InstalledProfile {
    uuid: string;
    name: string;
    bundleId: string;
    teamId: string;
    filePath: string;
}
export interface IosKeychainResult {
    keychainName: string;
    keychainPath: string;
    profiles: InstalledProfile[];
}
/**
 * Decode a provisioning profile's XML plist and extract metadata.
 * Uses `security cms -D -i <path>` to decode the CMS envelope.
 */
export declare function extractProfileMetadata(profilePath: string): Promise<InstalledProfile>;
export declare function installIosCredentials(credentials: {
    certificateP12: string;
    certificatePassword: string;
    provisioningProfile: string;
}, projectDir: string, extensionProfiles?: Record<string, string>): Promise<IosKeychainResult>;
//# sourceMappingURL=ios-keychain.d.ts.map