import * as core from '@actions/core';
import { runCleanup } from './utils/cleanup';

async function post(): Promise<void> {
  try {
    core.info('app-build: running post-action cleanup');
    await runCleanup();
    core.info('app-build: cleanup complete');
  } catch (error) {
    // Cleanup errors should not fail the action
    if (error instanceof Error) {
      core.warning(`Cleanup error: ${error.message}`);
    }
  }
}

post();
