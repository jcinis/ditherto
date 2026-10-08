import { readFile, writeFile } from 'node:fs/promises';
import { compareVersions, formulaVersion } from './update-homebrew.mjs';

const [candidate, target] = process.argv.slice(2);
if (!candidate || !target) throw new Error('Usage: node scripts/sync-homebrew.mjs CANDIDATE TARGET');
const incoming = await readFile(candidate, 'utf8');
const version = formulaVersion(incoming);
const current = await readFile(target, 'utf8').catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
if (current && compareVersions(version, formulaVersion(current)) < 0) {
  console.log(`Skipping older release ${version}; the tap already has ${formulaVersion(current)}.`);
} else {
  await writeFile(target, incoming);
  console.log(`Tap formula is now ${version}.`);
}
