import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { sign } from '../macos/sign.ts';
import { run } from '../process.ts';

const enabled = process.platform === 'darwin' && process.env.WISP_TEST_SIGNING === '1';
test.skipIf(!enabled)(
  'signed builds migrate, read and update a fixture; a different signer is refused',
  () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-signing-test.'));
    const keychain = path.join(directory, 'fixture.keychain-db');
    const searchList = () =>
      [...run('/usr/bin/security', ['list-keychains', '-d', 'user']).matchAll(/"([^"\n]+)"/g)].map(
        (match) => match[1]!,
      );
    const before = searchList();
    const make = (name: string, revision: number) => {
      const app = path.join(directory, name + '.app'),
        executable = path.join(app, 'Contents/MacOS/Wisp');
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.writeFileSync(
        path.join(app, 'Contents/Info.plist'),
        `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.wisp.desktop</string><key>CFBundleExecutable</key><string>Wisp</string><key>CFBundleName</key><string>Wisp</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>`,
      );
      run('clang++', [
        '-std=c++17',
        '-Wno-deprecated-declarations',
        `-DREVISION=${revision}`,
        'tools/tests/fixtures/keychain.cpp',
        '-framework',
        'Security',
        '-framework',
        'CoreFoundation',
        '-o',
        executable,
      ]);
      return { app, executable };
    };
    let first: ReturnType<typeof make> | undefined;
    try {
      first = make('First', 1);
      const second = make('Updated', 2),
        other = make('DifferentSigner', 3);
      sign(first.app);
      sign(second.app);
      const requirement = (app: string) => run('/usr/bin/codesign', ['-d', '-r-', app]).trim();
      expect(requirement(first.app)).toBe(requirement(second.app));
      expect(requirement(first.app)).toContain('certificate leaf');
      const hash = (file: string) =>
        createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      expect(hash(first.executable)).not.toBe(hash(second.executable));
      run(first.executable, [keychain, 'create']);
      run(second.executable, [keychain, 'migrate']);
      run(first.executable, [keychain, 'read-legacy']);
      run(second.executable, [keychain, 'read']);
      run(second.executable, [keychain, 'update']);
      run(first.executable, [keychain, 'read-refreshed']);
      run('/usr/bin/codesign', ['--force', '--sign', '-', other.app]);
      expect(spawnSync(other.executable, [keychain, 'read-refreshed']).status).not.toBe(0);
    } finally {
      if (first && fs.existsSync(keychain)) spawnSync(first.executable, [keychain, 'delete']);
      const current = searchList();
      if (current.includes(keychain) && !before.includes(keychain))
        run('/usr/bin/security', [
          'list-keychains',
          '-d',
          'user',
          '-s',
          ...current.filter((value) => value !== keychain),
        ]);
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
  30000,
);
