import fs from 'node:fs';
import path from 'node:path';

const required = [
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
];
const privateDirectory = /^(?:credentials|whatsapp|models)$/i;
const privateEntry =
  /^(?:settings\.json|cache\.json|messages\.json|translations\.json|saved-messages\.json|voice-transcripts\.json|\.env(?:\..*)?)$|\.(?:dpapi|p12|pfx|keychain(?:-db)?|log)$/i;

export function audit(bundle: string) {
  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isSymbolicLink() ||
        privateEntry.test(entry.name) ||
        (directory === bundle && privateDirectory.test(entry.name))
      )
        throw new Error(
          `Unexpected file in Windows bundle: ${path.relative(bundle, path.join(directory, entry.name))}`,
        );
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
    }
  }
  visit(bundle);
  for (const name of required) {
    const file = path.join(bundle, name);
    const stat = fs.existsSync(file) ? fs.statSync(file) : undefined;
    if (!stat?.isFile() || !stat.size) throw new Error(`Windows bundle is missing ${name}.`);
  }
  console.info('Windows bundle audit passed.');
}
