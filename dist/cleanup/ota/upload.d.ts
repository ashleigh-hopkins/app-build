export interface UploadStorageConfig {
    type: 's3' | 'gcs' | 'custom';
    bucket?: string;
    region?: string;
    prefix?: string;
    uploadCommand?: string;
}
export interface UploadOtaParams {
    distDir: string;
    manifestPath: string;
    storage: UploadStorageConfig;
}
export declare function uploadOtaUpdate(params: UploadOtaParams): Promise<void>;
//# sourceMappingURL=upload.d.ts.map