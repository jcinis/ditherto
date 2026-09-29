import { copyFile } from 'node:fs/promises';
for (const name of ['index', 'browser', 'dom', 'node', 'blue-noise']) {
  await copyFile(new URL(`../dist/${name}.d.ts`, import.meta.url), new URL(`../dist/${name}.d.cts`, import.meta.url));
}
