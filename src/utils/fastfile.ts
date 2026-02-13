import * as fs from 'fs';
import * as path from 'path';
import { registerCleanupFile } from './cleanup';

export async function generateFastfile(
  content: string,
  directory: string
): Promise<string> {
  // Fastlane expects Fastfile inside a `fastlane/` subdirectory
  const fastlaneDir = path.join(directory, 'fastlane');
  await fs.promises.mkdir(fastlaneDir, { recursive: true });
  const filePath = path.join(fastlaneDir, 'Fastfile');
  await fs.promises.writeFile(filePath, content, 'utf8');
  registerCleanupFile(filePath);
  return filePath;
}

export function iosBuildFastfile(params: {
  workspace: string;
  scheme: string;
  configuration: string;
  exportMethod: string;
  outputDir: string;
  outputName: string;
  profiles?: Array<{ bundleId: string; profileName: string }>;
  teamId?: string;
  xcodeprojPath?: string;
  xcargs?: string;
  derivedDataPath?: string;
}): string {
  // Signing is configured directly in pbxproj via configureXcodeSigning() in ios.ts.
  // The Fastfile needs codesigning_identity + export_options to match.
  let signingBlock = '';
  let exportOptionsBlock = '';

  if (params.profiles && params.profiles.length > 0 && params.teamId) {
    // Force signing identity at xcodebuild command level
    signingBlock = `,
      codesigning_identity: "Apple Distribution"`;

    const profileEntries = params.profiles
      .map((p) => `        "${p.bundleId}" => "${p.profileName}"`)
      .join(',\n');
    exportOptionsBlock = `,
      export_options: {
        signingStyle: "manual",
        teamID: "${params.teamId}",
        provisioningProfiles: {
${profileEntries}
        }
      }`;
  }

  return `default_platform(:ios)

platform :ios do
  lane :build do
    setup_ci

    build_app(
      workspace: "${params.workspace}",
      scheme: "${params.scheme}",
      configuration: "${params.configuration}",
      export_method: "${params.exportMethod}",
      output_directory: "${params.outputDir}",
      output_name: "${params.outputName}",
      clean: false,
      include_bitcode: false${params.xcargs ? `,\n      xcargs: "${params.xcargs}"` : ''}${params.derivedDataPath ? `,\n      derived_data_path: "${params.derivedDataPath}"` : ''}${signingBlock}${exportOptionsBlock}
    )
  end
end
`;
}

export function androidBuildFastfile(params: {
  projectDir: string;
  task: string;
  buildType: string;
}): string {
  return `default_platform(:android)

platform :android do
  lane :build do
    gradle(
      project_dir: "${params.projectDir}",
      task: "${params.task}",
      build_type: "${params.buildType}",
      print_command: false
    )
  end
end
`;
}

export function iosSubmitFastfile(params: { ipaPath: string }): string {
  return `default_platform(:ios)

platform :ios do
  lane :submit do
    api_key = app_store_connect_api_key(
      key_id: ENV["ASC_API_KEY_ID"],
      issuer_id: ENV["ASC_API_ISSUER_ID"],
      key_filepath: ENV["ASC_API_KEY_PATH"],
      in_house: false
    )

    upload_to_testflight(
      api_key: api_key,
      ipa: "${params.ipaPath}",
      skip_waiting_for_build_processing: true
    )
  end
end
`;
}

export function androidSubmitFastfile(params: {
  packageName: string;
  track: string;
  aabPath: string;
}): string {
  return `default_platform(:android)

platform :android do
  lane :submit do
    supply(
      json_key: ENV["GOOGLE_PLAY_JSON_KEY_PATH"],
      package_name: "${params.packageName}",
      track: "${params.track}",
      aab: "${params.aabPath}",
      release_status: "draft",
      skip_upload_metadata: true,
      skip_upload_images: true,
      skip_upload_screenshots: true
    )
  end
end
`;
}
