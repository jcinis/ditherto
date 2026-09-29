import dts from 'rollup-plugin-dts';

const external = (id) => id.startsWith('node:') || id === '@napi-rs/canvas';
const entries = ['index', 'browser', 'dom', 'node', 'cli', 'blue-noise'];

export default [
  ...entries.map((name) => ({
    input: `.build/${name}.js`,
    external,
    // Remove the entire Node loader from the dedicated browser bundle, including
    // dynamic native imports that consumer bundlers would otherwise try to resolve.
    plugins:
      (name === 'browser' || name === 'dom')
        ? [
            {
              name: 'browser-image-loader',
              resolveId(source) {
                if (source === './nodeIO.js') return '\0browser-node-loader';
              },
              load(id) {
                if (id === '\0browser-node-loader')
                  return 'export function loadNodeImage() { throw new Error("Use the main ditherto entry point for Node image loading"); }';
              },
            },
          ]
        : [],
    output: [
      {
        file: `dist/${name}.js`,
        format: 'es',
        ...(name === 'cli' ? { banner: '#!/usr/bin/env node' } : {}),
      },
      ...(name === 'cli' ? [] : [{ file: `dist/${name}.cjs`, format: 'cjs' }]),
    ],
  })),
  ...entries
    .filter((name) => name !== 'cli')
    .map((name) => ({
      input: `.build/${name}.d.ts`,
      external,
      output: { file: `dist/${name}.d.ts`, format: 'es' },
      plugins: [dts()],
    })),
];
