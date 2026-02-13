import * as core from '@actions/core';
import * as actionsExec from '@actions/exec';
import type { ExecOptions } from '@actions/exec';

export async function runCommand(
  command: string,
  args?: string[],
  options?: ExecOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  let stdout = '';
  let stderr = '';

  const displayArgs = args?.length ? ` ${args.join(' ')}` : '';
  core.info(`Running: ${command}${displayArgs}`);

  const exitCode = await actionsExec.exec(command, args, {
    ...options,
    listeners: {
      ...options?.listeners,
      stdout: (data: Buffer) => {
        stdout += data.toString();
        options?.listeners?.stdout?.(data);
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
        options?.listeners?.stderr?.(data);
      },
    },
  });

  if (exitCode !== 0) {
    throw new Error(
      `Command failed: ${command}${displayArgs} (exit code ${exitCode})\n${stderr}`
    );
  }

  return { exitCode, stdout, stderr };
}
