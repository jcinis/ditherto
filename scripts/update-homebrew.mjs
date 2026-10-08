import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export function stableVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Expected a stable version such as 0.2.0.');
  }
  return version;
}

export function verifyArchive(metadata, archive, version) {
  stableVersion(version);
  const url = `https://registry.npmjs.org/ditherto/-/ditherto-${version}.tgz`;
  if (metadata.name !== 'ditherto' || metadata.version !== version || metadata.dist?.tarball !== url) {
    throw new Error('Unexpected npm package identity or archive URL.');
  }
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  if (metadata.dist.integrity !== integrity) throw new Error('npm archive integrity mismatch.');
  return createHash('sha256').update(archive).digest('hex');
}

export function compareVersions(a, b) {
  const left = stableVersion(a).split('.').map(BigInt);
  const right = stableVersion(b).split('.').map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

export function formulaVersion(formula) {
  const version = formula.match(/url "https:\/\/registry\.npmjs\.org\/ditherto\/-\/ditherto-([^"/]+)\.tgz"/)?.[1];
  return stableVersion(version ?? '');
}

export function renderFormula(template, version, sha256, canvasRange, canvasVersion) {
  stableVersion(version);
  stableVersion(canvasVersion);
  if (!/^[a-f0-9]{64}$/.test(sha256) || !/^[~^]?\d+\.\d+\.\d+$/.test(canvasRange)) {
    throw new Error('Invalid checksum or unsupported canvas dependency range.');
  }
  const values = { VERSION: version, SHA256: sha256, CANVAS_RANGE: canvasRange, CANVAS_VERSION: canvasVersion };
  return template.replace(/@([A-Z0-9_]+)@/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown formula placeholder: ${key}`);
    return values[key];
  });
}

async function registryFetch(url) {
  // npm accepts publication before all registry endpoints are ready.
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (response.ok) return response;
    if (![404, 429, 500, 502, 503, 504].includes(response.status) || attempt === 29) {
      throw new Error(`Registry request failed: ${response.status} ${url}`);
    }
    console.log(`Waiting for npm registry availability (${response.status})…`);
    await response.body?.cancel();
    await delay(10_000);
  }
}

async function main() {
  const [version, output] = process.argv.slice(2);
  stableVersion(version);
  if (!output) throw new Error('Usage: node scripts/update-homebrew.mjs VERSION OUTPUT');
  const root = new URL('../', import.meta.url);
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'));
  const metadata = await (await registryFetch(`https://registry.npmjs.org/ditherto/${version}`)).json();
  if (metadata.dependencies?.['@napi-rs/canvas'] !== pkg.dependencies['@napi-rs/canvas']) {
    throw new Error('Published canvas dependency differs from this checkout; use the release source.');
  }
  // Construct the download URL ourselves rather than trusting a registry redirect field.
  const archive = Buffer.from(await (await registryFetch(`https://registry.npmjs.org/ditherto/-/ditherto-${version}.tgz`)).arrayBuffer());
  const sha256 = verifyArchive(metadata, archive, version);
  const template = await readFile(new URL('packaging/homebrew/ditherto.rb.in', root), 'utf8');
  const formula = renderFormula(template, version, sha256, pkg.dependencies['@napi-rs/canvas'], lock.packages['node_modules/@napi-rs/canvas'].version);
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(output, formula);
  console.log(`Generated Homebrew formula for ditherto ${version}; SHA-256 ${sha256}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
