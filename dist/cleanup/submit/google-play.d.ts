export interface GooglePlaySubmitParams {
    artifactPath: string;
    packageName: string;
    track: string;
    serviceAccountBase64: string;
    projectDir: string;
}
export declare function submitToGooglePlay(params: GooglePlaySubmitParams): Promise<void>;
//# sourceMappingURL=google-play.d.ts.map