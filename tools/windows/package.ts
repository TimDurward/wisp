import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../process.ts';
import { projectVersion } from '../project.ts';
import { audit } from './bundle.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('Windows packaging currently requires Windows x64.');
if (process.argv.length > 2) throw new Error('Usage: npm run package:windows');

const qmake = process.env.QMAKE || 'qmake6';
const qtBin = run(qmake, ['-query', 'QT_INSTALL_BINS']).trim();
const cargoAbout = process.env.CARGO_ABOUT || 'cargo-about';
run(cargoAbout, ['--version'], { stdio: 'inherit' });
run(process.env.CARGO || 'cargo', ['build', '--release', '--locked'], { stdio: 'inherit' });
const version = projectVersion();
const licenseReport = path.join(root, 'target/wisp-windows-dependency-licenses.html');
run(
  cargoAbout,
  [
    'generate',
    '--locked',
    '--target',
    'x86_64-pc-windows-msvc',
    'tools/licenses.hbs',
    '-o',
    licenseReport,
  ],
  { stdio: 'inherit' },
);

const dist = path.resolve(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
function insideDist(candidate: string): string {
  const resolved = path.resolve(candidate);
  const relative = path.relative(dist, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Packaging paths must stay inside dist.');
  return resolved;
}
const stage = insideDist(fs.mkdtempSync(path.join(dist, '.wisp-windows.')));
const bundle = insideDist(path.join(stage, 'Wisp'));
const destination = insideDist(path.join(dist, 'Wisp-windows-x64'));
try {
  fs.mkdirSync(bundle);
  const executable = path.join(bundle, 'Wisp.exe');
  fs.copyFileSync(path.join(root, 'target/release/wisp.exe'), executable);
  run(
    path.join(qtBin, 'windeployqt.exe'),
    [
      '--release',
      '--qmldir',
      path.join(root, 'qml'),
      '--dir',
      bundle,
      '--no-translations',
      '--no-compiler-runtime',
      '--skip-plugin-types',
      'qmltooling',
      // Wisp does not use serial GPS receivers; this provider needs SerialPort.
      '--exclude-plugins',
      'qtposition_nmea',
      executable,
    ],
    { stdio: 'inherit' },
  );
  fs.writeFileSync(path.join(bundle, 'qt.conf'), '[Paths]\nPrefix=.\n');
  const notices = path.join(bundle, 'licenses');
  fs.cpSync(path.join(root, 'assets/licenses'), notices, { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(notices, 'Wisp-MIT.txt'));
  fs.copyFileSync(path.join(root, 'NOTICE'), path.join(notices, 'NOTICE.txt'));
  fs.copyFileSync(licenseReport, path.join(notices, 'Rust-dependencies.html'));
  fs.writeFileSync(
    path.join(bundle, 'README.txt'),
    `Wisp ${version} - experimental Windows x64 build\n\n` +
      'Run Wisp.exe. Keep this entire folder together; Qt is included.\n' +
      'Microsoft Visual C++ v14 x64 Redistributable is required.\n' +
      'Official installer: https://aka.ms/vc14/vc_redist.x64.exe\n\n' +
      'Settings and WhatsApp data are stored in your Windows user profile.\n' +
      'This local build is unsigned. Dependency notices are in licenses/.\n',
  );
  audit(bundle);
  let backup: string | undefined;
  if (fs.existsSync(destination)) {
    backup = insideDist(fs.mkdtempSync(path.join(dist, '.wisp-previous.')));
    fs.renameSync(destination, insideDist(path.join(backup, 'Wisp-windows-x64')));
  }
  try {
    fs.renameSync(bundle, destination);
  } catch (error) {
    if (backup) fs.renameSync(insideDist(path.join(backup, 'Wisp-windows-x64')), destination);
    throw error;
  }
  console.info(`Built ${destination}`);
  if (backup) console.info(`Previous build retained in ${backup}`);
} finally {
  fs.rmSync(insideDist(stage), { recursive: true, force: true });
}
