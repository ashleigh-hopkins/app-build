/**
 * Resolve and change to the working directory if specified.
 * Must be called before any path-relative operations (config parsing, npm install, etc.).
 * Exported for testability.
 */
export declare function resolveWorkingDirectory(workingDirectory: string | undefined): void;
/**
 * Parse a JSON string of environment variables and set them on process.env.
 * Logs the keys being set (not values, which may be sensitive).
 * Returns the parsed object for testability.
 */
export declare function applyEnvironmentVariables(jsonInput: string): Record<string, string>;
//# sourceMappingURL=index.d.ts.map