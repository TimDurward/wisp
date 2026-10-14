import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../process.ts';
import { audit, pruneSqlDrivers, relocate } from './bundle.ts';
import { sign } from './sign.ts';
import { projectVersion } from '../project.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
process.chdir(root);
if (process.platform !== 'darwin') throw new Error('macOS packaging requires macOS.');
const args = process.argv.slice(2);
if (args.some((value) => !['--reuse-runtime', '--ad-hoc'].includes(value)))
  throw new Error('Usage: npm run package:mac -- [--reuse-runtime] [--ad-hoc]');
const qmake = process.env.QMAKE || 'qmake6';
const libraries = run(qmake, ['-query', 'QT_INSTALL_LIBS']).trim();
run(process.env.CARGO || 'cargo', ['build', '--release', '--locked'], { stdio: 'inherit' });
const version = projectVersion();
const licenseReport = path.join(root, 'target/wisp-dependency-licenses.html');
run(
  'cargo-about',
  [
    'generate',
    '--locked',
    '--target',
    process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin',
    'tools/licenses.hbs',
    '-o',
    licenseReport,
  ],
  { stdio: 'inherit' },
);
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });
const stage = fs.mkdtempSync(path.join(dist, '.wisp-package.'));
const bundle = path.join(stage, 'Wisp.app'),
  destination = path.join(dist, 'Wisp.app');
try {
  if (args.includes('--reuse-runtime')) {
    const version = run(qmake, ['-query', 'QT_VERSION']).trim();
    const core = path.join(destination, 'Contents/Frameworks/QtCore.framework/Versions/A/QtCore');
    if (!fs.existsSync(core) || !run('otool', ['-L', core]).includes(`current version ${version})`))
      throw new Error('Runtime reuse requires a bundle built with the current Qt installation.');
    fs.cpSync(destination, bundle, { recursive: true, verbatimSymlinks: true });
  }
  fs.mkdirSync(path.join(bundle, 'Contents/MacOS'), { recursive: true });
  fs.mkdirSync(path.join(bundle, 'Contents/Resources'), { recursive: true });
  fs.copyFileSync('target/release/wisp', path.join(bundle, 'Contents/MacOS/Wisp'));
  fs.copyFileSync('native/platform/macos/Info.plist', path.join(bundle, 'Contents/Info.plist'));
  const info = path.join(bundle, 'Contents/Info.plist');
  run('plutil', [
    '-replace',
    'CFBundleShortVersionString',
    '-string',
    version.split('-')[0]!,
    info,
  ]);
  run('plutil', ['-replace', 'CFBundleVersion', '-string', version.split('-')[0]!, info]);
  const notices = path.join(bundle, 'Contents/Resources/licenses');
  fs.cpSync(path.join(root, 'assets/licenses'), notices, { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(notices, 'Wisp-MIT.txt'));
  fs.copyFileSync(path.join(root, 'NOTICE'), path.join(notices, 'NOTICE.txt'));
  fs.copyFileSync(licenseReport, path.join(notices, 'Rust-dependencies.html'));
  const iconset = path.join(root, 'target/Wisp.iconset'),
    icon = path.join(root, 'target/wisp-icon.png');
  fs.mkdirSync(iconset, { recursive: true });
  run('target/release/wisp', [`--icon-export=${icon}`], {
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' },
  });
  for (const size of [16, 32, 128, 256, 512])
    for (const retina of [false, true])
      run('sips', [
        '-z',
        String(retina ? size * 2 : size),
        String(retina ? size * 2 : size),
        icon,
        '--out',
        path.join(iconset, `icon_${size}x${size}${retina ? '@2x' : ''}.png`),
      ]);
  run('iconutil', ['-c', 'icns', iconset, '-o', path.join(bundle, 'Contents/Resources/Wisp.icns')]);
  if (!args.includes('--reuse-runtime'))
    run(
      process.env.WISP_DEPLOYQT || 'macdeployqt',
      [
        bundle,
        `-qmldir=${path.join(root, 'qml')}`,
        `-libpath=${libraries}`,
        '-no-strip',
        '-no-codesign',
        '-verbose=2',
      ],
      { stdio: 'inherit' },
    );
  pruneSqlDrivers(bundle);
  relocate(bundle, libraries);
  audit(bundle);
  sign(bundle, args.includes('--ad-hoc'));
  let backup: string | undefined;
  if (fs.existsSync(destination)) {
    backup = fs.mkdtempSync(path.join(dist, '.wisp-previous.'));
    fs.renameSync(destination, path.join(backup, 'Wisp.app'));
  }
  try {
    fs.renameSync(bundle, destination);
  } catch (error) {
    if (backup) fs.renameSync(path.join(backup, 'Wisp.app'), destination);
    throw error;
  }
  console.info(`Built ${destination}`);
  if (backup) console.info(`Previous build retained in ${backup}`);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
