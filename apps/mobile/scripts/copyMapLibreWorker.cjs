const { copyFileSync, mkdirSync } = require('node:fs');
const { dirname, join, resolve } = require('node:path');

const packageDirectory = dirname(require.resolve('maplibre-gl/package.json'));
const outputDirectory = resolve(__dirname, '..', 'dist-web', '_expo', 'static', 'js', 'web');

mkdirSync(outputDirectory, { recursive: true });

for (const filename of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  copyFileSync(join(packageDirectory, 'dist', filename), join(outputDirectory, filename));
}
