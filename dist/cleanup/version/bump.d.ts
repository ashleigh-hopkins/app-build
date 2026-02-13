export interface BumpResult {
    previousValue: number;
    newValue: number;
    field: string;
}
/**
 * Reads the version field from app.json (or another source), increments it by 1,
 * writes the file back, sets the `build-number` output, and returns the result.
 */
export declare function bumpVersion(platform: 'ios' | 'android', projectDir: string, source?: string): Promise<BumpResult>;
//# sourceMappingURL=bump.d.ts.map