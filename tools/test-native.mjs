import { execFileSync } from 'node:child_process';
const qmake = process.env.QMAKE || 'qmake6';
const qt = execFileSync(qmake, ['-query', 'QT_INSTALL_PREFIX'], { encoding: 'utf8' }).trim();
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
])
  execFileSync(command, args, { stdio: 'inherit' });
