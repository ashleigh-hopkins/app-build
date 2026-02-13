import * as esbuild from 'esbuild';

const commonOptions = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  // Bundle everything — GitHub Actions needs self-contained files
  packages: 'bundle',
};

async function build() {
  // Main entry point: src/index.ts → dist/index.js
  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
  });

  // Cleanup entry point: src/cleanup.ts → dist/cleanup/index.js
  await esbuild.build({
    ...commonOptions,
    entryPoints: ['src/cleanup.ts'],
    outfile: 'dist/cleanup/index.js',
  });

  console.log('Build complete: dist/index.js, dist/cleanup/index.js');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
