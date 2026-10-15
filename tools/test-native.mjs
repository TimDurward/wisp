import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
const qmake = process.env.QMAKE || 'qmake6';
const qt = execFileSync(qmake, ['-query', 'QT_INSTALL_PREFIX'], { encoding: 'utf8' }).trim();
// Windows resolves Qt's DLLs through PATH, including in CTest child processes.
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH';
const env = {
  ...process.env,
  [pathKey]: `${path.join(qt, 'bin')}${path.delimiter}${process.env[pathKey] || ''}`,
};
// Qt's offscreen platform does not use the Windows system font database.
if (process.platform === 'win32' && !env.QT_QPA_FONTDIR && process.env.WINDIR)
  env.QT_QPA_FONTDIR = path.join(process.env.WINDIR, 'Fonts');
for (const [command, args] of [
  [
    'cmake',
    [
      '-S',
      'tests/native',
      '-B',
      'target/native-tests',
      `-DCMAKE_PREFIX_PATH=${qt}`,
      '-DCMAKE_BUILD_TYPE=Release',
    ],
  ],
  ['cmake', ['--build', 'target/native-tests', '--config', 'Release', '--parallel']],
  [
    'ctest',
    ['--test-dir', 'target/native-tests', '--build-config', 'Release', '--output-on-failure'],
  ],
]) {
  const reports = ['editor', 'settings'].map((name) => `target/native-tests/${name}-results.txt`);
  if (process.platform === 'win32' && command === 'ctest')
    for (const report of reports) rmSync(report, { force: true });
  try {
    execFileSync(command, args, { stdio: 'inherit', env });
  } finally {
    if (process.platform === 'win32' && command === 'ctest')
      for (const report of reports)
        if (existsSync(report)) process.stdout.write(readFileSync(report, 'utf8'));
  }
}
