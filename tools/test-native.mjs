import { execFileSync } from 'node:child_process';
const qmake = process.env.QMAKE || 'qmake6';
const qt = execFileSync(qmake, ['-query', 'QT_INSTALL_PREFIX'], { encoding: 'utf8' }).trim();
for (const [command, args] of [
  ['cmake', ['-S', 'tests/native', '-B', 'target/native-tests', `-DCMAKE_PREFIX_PATH=${qt}`]],
  ['cmake', ['--build', 'target/native-tests', '--parallel']],
  ['ctest', ['--test-dir', 'target/native-tests', '--output-on-failure']],
])
  execFileSync(command, args, { stdio: 'inherit' });
