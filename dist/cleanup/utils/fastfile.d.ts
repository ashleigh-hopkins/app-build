export declare function generateFastfile(content: string, directory: string): Promise<string>;
export declare function iosBuildFastfile(params: {
    workspace: string;
    scheme: string;
    configuration: string;
    exportMethod: string;
    outputDir: string;
    outputName: string;
    profiles?: Array<{
        bundleId: string;
        profileName: string;
    }>;
    teamId?: string;
    xcodeprojPath?: string;
}): string;
export declare function androidBuildFastfile(params: {
    projectDir: string;
    task: string;
    buildType: string;
}): string;
export declare function iosSubmitFastfile(params: {
    ipaPath: string;
}): string;
export declare function androidSubmitFastfile(params: {
    packageName: string;
    track: string;
    aabPath: string;
}): string;
//# sourceMappingURL=fastfile.d.ts.map