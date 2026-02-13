import type { ExecOptions } from '@actions/exec';
export declare function runCommand(command: string, args?: string[], options?: ExecOptions): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}>;
//# sourceMappingURL=exec.d.ts.map