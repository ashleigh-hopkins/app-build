export interface AscApiKeyResult {
    keyJsonPath: string;
    keyFilePath: string;
}
export declare function installAscApiKey(credentials: {
    keyId: string;
    issuerId: string;
    keyP8: string;
}): Promise<AscApiKeyResult>;
//# sourceMappingURL=asc-api-key.d.ts.map