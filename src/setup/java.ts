import * as core from '@actions/core';
import { runCommand } from '../utils/exec';

/**
 * Validate that the runner's JDK version matches the requested version.
 *
 * Unlike Xcode (where we can switch between installed versions), JDK is
 * typically pre-installed on GitHub Actions runners. This function validates
 * the installed version and provides clear error messages if there's a mismatch.
 *
 * On GitHub Actions ubuntu-latest, JDK 17 is the default (JAVA_HOME_17_X64).
 * Multiple versions are available via JAVA_HOME_<version>_X64 env vars.
 */
export async function setupJava(requestedVersion?: string): Promise<void> {
  if (!requestedVersion) {
    core.info('Step: Java version (using runner default)');
    await logCurrentJavaVersion();
    return;
  }

  core.info(`Step: Java version (requested: ${requestedVersion})`);

  // On GitHub Actions runners, multiple JDKs are pre-installed.
  // Try to find the requested version via JAVA_HOME_<version>_X64.
  const arch = process.arch === 'arm64' ? 'ARM64' : 'X64';
  const javaHomeVar = `JAVA_HOME_${requestedVersion}_${arch}`;
  const javaHome = process.env[javaHomeVar];

  if (javaHome) {
    core.info(`Found ${javaHomeVar}: ${javaHome}`);
    core.exportVariable('JAVA_HOME', javaHome);
    core.addPath(`${javaHome}/bin`);
    await logCurrentJavaVersion();
    return;
  }

  // Fall back to checking the current JAVA_HOME
  const currentJavaHome = process.env.JAVA_HOME;
  if (currentJavaHome) {
    const currentVersion = await getJavaMajorVersion();
    if (currentVersion === requestedVersion) {
      core.info(`Current JDK ${currentVersion} matches requested version`);
      return;
    }

    core.warning(
      `Requested Java ${requestedVersion} but the current version is ${currentVersion}. ` +
        `No ${javaHomeVar} env var found on this runner. ` +
        `Consider adding actions/setup-java before this action if you need a specific version.`,
    );
    return;
  }

  core.warning(
    `JAVA_HOME is not set and no ${javaHomeVar} env var found. ` +
      `Gradle will use whatever java is on PATH.`,
  );
  await logCurrentJavaVersion();
}

async function logCurrentJavaVersion(): Promise<void> {
  try {
    const { stdout } = await runCommand('java', ['-version'], {
      // java -version writes to stderr
      silent: true,
    });
    // java -version output goes to stderr, but runCommand may capture it
    const firstLine = stdout.trim().split('\n')[0] || '(unknown)';
    core.info(`Current Java: ${firstLine}`);
  } catch {
    core.info('Current Java: unable to detect (java not found on PATH)');
  }
}

async function getJavaMajorVersion(): Promise<string | null> {
  try {
    const { stdout } = await runCommand('java', ['-version'], { silent: true });
    // Parse output like: openjdk version "17.0.9" or java version "21.0.1"
    const match = stdout.match(/version "(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
