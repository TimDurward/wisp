import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from '../process.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const security = '/usr/bin/security',
  codesign = '/usr/bin/codesign';
function searchList(): string[] {
  return [...run(security, ['list-keychains', '-d', 'user']).matchAll(/"([^"\n]+)"/g)].map(
    (match) => match[1]!,
  );
}
export function sign(bundle: string, adHoc = false) {
  const entitlements = path.join(root, 'native/platform/macos/entitlements.plist');
  const identity = process.env.WISP_SIGNING_IDENTITY;
  if (identity === '-' && !adHoc)
    throw new Error('Use --ad-hoc explicitly, or choose a certificate.');
  if (adHoc) {
    run(codesign, ['--force', '--deep', '--sign', '-', '--entitlements', entitlements, bundle]);
    console.info('Ad hoc build: Keychain may request permission again after rebuilding.');
  } else if (identity && identity !== '-') {
    run(codesign, [
      '--force',
      '--deep',
      '--sign',
      identity,
      '--entitlements',
      entitlements,
      bundle,
    ]);
  } else {
    const directory = path.join(root, '.wisp-signing');
    const certificate = path.join(directory, 'certificate.der'),
      passwordFile = path.join(directory, 'keychain.password'),
      chain = path.join(directory, 'local.keychain-db');
    for (const file of [directory, certificate, passwordFile, chain]) {
      if (!fs.existsSync(file))
        throw new Error(
          'Choose an existing WISP_SIGNING_IDENTITY or use --ad-hoc for local development.',
        );
      if (fs.lstatSync(file).isSymbolicLink())
        throw new Error('Signing paths must not be symbolic links.');
    }
    const lock = path.join(directory, 'signing.lock');
    fs.mkdirSync(lock, { mode: 0o700 });
    let added = false,
      unlocked = false;
    const helper = path.join(root, 'target/tools/macos-keychain');
    try {
      fs.mkdirSync(path.dirname(helper), { recursive: true });
      run('clang++', [
        '-std=c++17',
        '-Wno-deprecated-declarations',
        path.join(root, 'tools/macos/keychain.cpp'),
        '-framework',
        'Security',
        '-framework',
        'CoreFoundation',
        '-o',
        helper,
      ]);
      run(helper, ['unlock', chain], { input: fs.readFileSync(passwordFile, 'utf8') + '\n' });
      unlocked = true;
      const before = searchList();
      if (!before.includes(chain)) {
        run(security, ['list-keychains', '-d', 'user', '-s', ...before, chain]);
        added = true;
      }
      const fingerprint = createHash('sha1').update(fs.readFileSync(certificate)).digest('hex');
      const args = [
        '--force',
        '--sign',
        fingerprint,
        '--keychain',
        chain,
        '--timestamp=none',
        '--entitlements',
        entitlements,
      ];
      run(codesign, [...args, '--deep', bundle]);
      const requirement = `identifier "com.wisp.desktop" and certificate leaf = H"${fingerprint}"`;
      run(codesign, [...args, '--requirements', '=designated => ' + requirement, bundle]);
      run(codesign, ['--verify', '--strict', '-R', '=' + requirement, bundle]);
    } finally {
      try {
        if (added)
          run(security, [
            'list-keychains',
            '-d',
            'user',
            '-s',
            ...searchList().filter((value) => value !== chain),
          ]);
      } finally {
        try {
          if (unlocked) run(helper, ['lock', chain]);
        } finally {
          fs.rmSync(lock, { recursive: true });
        }
      }
    }
  }
  run(codesign, ['--verify', '--deep', '--strict', bundle]);
  console.info('Signed and verified Wisp.');
}
