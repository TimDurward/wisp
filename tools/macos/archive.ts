import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from '../process.ts';
import { projectVersion } from '../project.ts';
import { audit } from './bundle.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
if (process.platform !== 'darwin') throw new Error('macOS release archives require macOS.');
const version = projectVersion();
if (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error('The release tag must match the version in Cargo.toml.');
const architecture = process.arch;
if (architecture !== 'arm64' && architecture !== 'x64')
  throw new Error('Only arm64 and x64 macOS builds are supported.');
const bundle = path.join(root, 'dist/Wisp.app');
audit(bundle);
run('codesign', ['--verify', '--deep', '--strict', bundle]);
const name = `Wisp-${version}-macos-${architecture}.zip`;
const output = path.join(root, 'dist', name);
run('ditto', ['-c', '-k', '--keepParent', '--norsrc', bundle, output]);
const hash = createHash('sha256');
for await (const chunk of createReadStream(output)) hash.update(chunk);
fs.writeFileSync(`${output}.sha256`, `${hash.digest('hex')}  ${name}\n`);
console.info(`Created dist/${name} and checksum.`);
