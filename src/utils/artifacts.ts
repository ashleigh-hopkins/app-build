import * as core from '@actions/core';
import * as glob from '@actions/glob';
import { DefaultArtifactClient } from '@actions/artifact';

export async function findArtifact(
  pattern: string,
  directory: string
): Promise<string> {
  const fullPattern = `${directory}/${pattern}`;
  const globber = await glob.create(fullPattern);
  const files = await globber.glob();

  if (files.length === 0) {
    throw new Error(
      `No artifact found matching pattern "${pattern}" in "${directory}"`
    );
  }

  return files[0];
}

export async function uploadArtifact(
  name: string,
  filePath: string
): Promise<void> {
  core.info(`Uploading artifact: ${name} from ${filePath}`);

  const client = new DefaultArtifactClient();
  const rootDirectory = filePath.substring(0, filePath.lastIndexOf('/'));

  await client.uploadArtifact(name, [filePath], rootDirectory);

  core.info(`Artifact "${name}" uploaded successfully`);
}
