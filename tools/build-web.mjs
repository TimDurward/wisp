import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const options = {
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  loader: { '.css': 'text' },
  legalComments: 'none',
};
await build({ ...options, entryPoints: ['web/src/main.ts'], outfile: 'web/dist/wisp.js' });
if (process.argv.includes('--tests')) {
  await build({
    ...options,
    entryPoints: ['web/tests/support/browser-entry.ts'],
    outfile: 'web/dist/testing.js',
  });
  await build({
    ...options,
    entryPoints: ['web/tests/support/qt-entry.ts'],
    outfile: 'web/dist/qt-fixture.js',
  });
}
