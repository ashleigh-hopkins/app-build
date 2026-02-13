export interface IosMatchParams {
    type: string;
    storage: string;
    gitUrl?: string;
    matchPassword: string;
    gitPrivateKey?: string;
}
export declare function installIosCredentialsViaMatch(params: IosMatchParams, projectDir: string): Promise<void>;
//# sourceMappingURL=ios-match.d.ts.map