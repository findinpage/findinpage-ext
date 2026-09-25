import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const fileName = 'findinpage-demo.js';
const outputPath = new URL(`../dist/demo/${fileName}`, import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const contents = await readFile(outputPath);
const manifest = {
  version: packageJson.version,
  file: fileName,
  sha256: createHash('sha256').update(contents).digest('hex'),
};

await writeFile(
  new URL('../dist/demo/manifest.json', import.meta.url),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
