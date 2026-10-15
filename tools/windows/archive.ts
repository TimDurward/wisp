import fs, { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from '../process.ts';
import { projectVersion } from '../project.ts';
import { audit } from './bundle.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Windows release archives currently require Windows x64.');
if (process.argv.length > 2) throw new Error('Usage: npm run release:windows');
const version = projectVersion();
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`)
  throw new Error('The release tag must match the version in Cargo.toml.');
const dist = path.join(root, 'dist');
const bundle = path.join(dist, 'Wisp-windows-x64');
audit(bundle);
const name = `Wisp-${version}-windows-x64.zip`;
const stage = fs.mkdtempSync(path.join(dist, '.wisp-archive.'));
try {
  const output = path.join(stage, name);
  // Pass paths as environment values, never as interpolated PowerShell code.
  run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; " +
        '[IO.Compression.ZipFile]::CreateFromDirectory($env:WISP_ARCHIVE_SOURCE, $env:WISP_ARCHIVE_OUTPUT, [IO.Compression.CompressionLevel]::Optimal, $true)',
    ],
    { env: { ...process.env, WISP_ARCHIVE_SOURCE: bundle, WISP_ARCHIVE_OUTPUT: output } },
  );
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(output)) hash.update(chunk);
  fs.writeFileSync(`${output}.sha256`, `${hash.digest('hex')}  ${name}\n`);
  fs.renameSync(output, path.join(dist, name));
  fs.renameSync(`${output}.sha256`, path.join(dist, `${name}.sha256`));
  console.info(`Created dist/${name} and checksum.`);
} finally {
  // mkdtemp creates this directory directly under the resolved dist directory.
  fs.rmSync(stage, { recursive: true, force: true });
}
