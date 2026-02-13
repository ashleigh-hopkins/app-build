export interface AndroidKeystoreResult {
    keystorePath: string;
    keyAlias: string;
}
export declare function installAndroidKeystore(credentials: {
    androidKeystore: string;
    androidKeystorePassword: string;
    androidKeyAlias: string;
    androidKeyPassword: string;
}, projectDir: string): Promise<AndroidKeystoreResult>;
export declare function verifyKeystoreSigningConfig(projectDir: string): Promise<void>;
//# sourceMappingURL=android-keystore.d.ts.map