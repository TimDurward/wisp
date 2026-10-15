import { afterEach, beforeEach, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit } from '../windows/bundle.ts';

let fixture: string, bundle: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-windows-bundle-'));
  bundle = path.join(fixture, 'Wisp');
  for (const name of [
    'Wisp.exe',
    'qt.conf',
    'Qt6Core.dll',
    'Qt6WebEngineCore.dll',
    'QtWebEngineProcess.exe',
    'platforms/qwindows.dll',
    'qml/Qt/labs/StyleKit/qmldir',
    'resources/qtwebengine_resources.pak',
    'resources/icudtl.dat',
    'translations/qtwebengine_locales/en-US.pak',
    'README.txt',
    'licenses/NOTICE.txt',
    'licenses/Wisp-MIT.txt',
    'licenses/Rust-dependencies.html',
    // Qt's Models module is runtime code, not a downloaded speech model.
    'qml/QtQml/Models/qmldir',
  ]) {
    const file = path.join(bundle, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'Synthetic deployment fixture');
  }
});
afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

test('Windows bundles require WebEngine resources, locale, and dependency notices', () => {
  expect(() => audit(bundle)).not.toThrow();
  for (const name of [
    'resources/icudtl.dat',
    'translations/qtwebengine_locales/en-US.pak',
    'licenses/Rust-dependencies.html',
  ]) {
    const file = path.join(bundle, name);
    fs.renameSync(file, `${file}.missing`);
    expect(() => audit(bundle)).toThrow(name);
    fs.renameSync(`${file}.missing`, file);
  }
});

test('Windows archives reject accidentally bundled profile data', () => {
  for (const name of [
    'settings.json',
    'saved-messages.json',
    'voice-transcripts.json',
    'credentials/account.dpapi',
    'whatsapp/Default/History',
    'models/ggml-small.bin',
  ]) {
    const file = path.join(bundle, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'Synthetic private data');
    expect(() => audit(bundle)).toThrow('Unexpected file');
    fs.rmSync(file);
    if (name.includes('/')) fs.rmSync(path.join(bundle, name.split('/')[0]!), { recursive: true });
  }
});

test('Windows archives reject links to files outside the bundle', () => {
  const outside = path.join(fixture, 'external-profile');
  fs.mkdirSync(outside);
  fs.symlinkSync(
    outside,
    path.join(bundle, 'external'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  expect(() => audit(bundle)).toThrow('Unexpected file');
});
