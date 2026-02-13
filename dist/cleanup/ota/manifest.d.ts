export interface AssetInfo {
    hash: string;
    key: string;
    contentType: string;
    fileExtension: string;
    url: string;
}
export interface UpdateManifest {
    id: string;
    createdAt: string;
    runtimeVersion: string;
    launchAsset: AssetInfo;
    assets: AssetInfo[];
    metadata: Record<string, unknown>;
    extra: Record<string, unknown>;
}
export declare function generateManifest(params: {
    distDir: string;
    runtimeVersion: string;
    baseUrl: string;
    platform: string;
}): Promise<UpdateManifest>;
export declare function writeManifest(manifest: UpdateManifest, outputPath: string): Promise<void>;
export declare function readRuntimeVersion(projectDir: string): string;
//# sourceMappingURL=manifest.d.ts.map