import * as actionsExec from '@actions/exec';
import { computeFingerprint } from '../../src/fingerprint/compute';

jest.mock('@actions/core');
jest.mock('@actions/exec');

const mockExec = actionsExec.exec as jest.MockedFunction<typeof actionsExec.exec>;

function mockExecStdout(output: string): void {
  mockExec.mockImplementation(async (_cmd, _args, options) => {
    if (options?.listeners?.stdout) {
      options.listeners.stdout(Buffer.from(output));
    }
    return 0;
  });
}

function mockExecFailure(stderr: string): void {
  mockExec.mockImplementation(async (_cmd, _args, options) => {
    if (options?.listeners?.stderr) {
      options.listeners.stderr(Buffer.from(stderr));
    }
    return 1;
  });
}

describe('computeFingerprint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns hash and source count from @expo/fingerprint output', async () => {
    const fingerprintOutput = JSON.stringify({
      hash: 'abc123def456',
      sources: [
        { type: 'dir', filePath: 'ios/MyApp', hash: 'aaa' },
        { type: 'dir', filePath: 'ios/Pods', hash: 'bbb' },
        { type: 'contents', filePath: 'package.json', hash: 'ccc' },
      ],
    });
    mockExecStdout(fingerprintOutput);

    const result = await computeFingerprint('ios', '/project');

    expect(result.hash).toBe('abc123def456');
    expect(result.sourceCount).toBe(3);

    // Verify it called npx @expo/fingerprint with correct args
    expect(mockExec).toHaveBeenCalledWith(
      'npx',
      ['@expo/fingerprint', 'fingerprint:generate', '--platform', 'ios'],
      expect.objectContaining({ cwd: '/project' }),
    );
  });

  it('works for android platform', async () => {
    mockExecStdout(JSON.stringify({ hash: 'xyz789', sources: [] }));

    const result = await computeFingerprint('android', '/project');

    expect(result.hash).toBe('xyz789');
    expect(result.sourceCount).toBe(0);
    expect(mockExec).toHaveBeenCalledWith(
      'npx',
      ['@expo/fingerprint', 'fingerprint:generate', '--platform', 'android'],
      expect.anything(),
    );
  });

  it('throws on invalid JSON output', async () => {
    mockExecStdout('not valid json');

    await expect(computeFingerprint('ios', '/project'))
      .rejects.toThrow('Failed to parse @expo/fingerprint output');
  });

  it('throws on missing hash field', async () => {
    mockExecStdout(JSON.stringify({ sources: [] }));

    await expect(computeFingerprint('ios', '/project'))
      .rejects.toThrow('missing or non-string hash field');
  });

  it('throws when command fails', async () => {
    mockExecFailure('npx: command not found');

    await expect(computeFingerprint('ios', '/project'))
      .rejects.toThrow('Command failed');
  });
});
