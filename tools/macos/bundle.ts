import fs from 'node:fs';
import path from 'node:path';
import { run } from '../process.ts';

export function dependencies(output: string): string[] {
  return output
    .split('\n')
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.trim().split(' (', 1)[0]!);
}
export function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export function copyFramework(source: string, destination: string) {
  // Homebrew may expose the framework root through an SDK symlink.
  fs.cpSync(fs.realpathSync(source), destination, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => path.basename(source) !== 'Headers' && !source.endsWith('.prl'),
  });
}
export function pruneSqlDrivers(bundle: string) {
  // macdeployqt copies all SQL drivers, including unused drivers with external server libraries.
  const directory = path.join(bundle, 'Contents/PlugIns/sqldrivers');
  if (!fs.existsSync(directory)) return;
  for (const name of fs.readdirSync(directory))
    if (name !== 'libqsqlite.dylib') fs.rmSync(path.join(directory, name), { recursive: true });
}
export function binaries(bundle: string, directory = bundle): string[] {
  const found = new Set<string>();
  function visit(directory: string) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      const resolved = fs.realpathSync(candidate);
      if (!inside(bundle, resolved))
        throw new Error(`External bundle symlink: ${path.relative(bundle, candidate)}`);
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        if (!entry.isSymbolicLink()) visit(candidate);
        continue;
      }
      if (!stat.isFile() || found.has(resolved)) continue;
      const header = Buffer.alloc(4),
        descriptor = fs.openSync(resolved, 'r');
      try {
        fs.readSync(descriptor, header, 0, 4, 0);
      } finally {
        fs.closeSync(descriptor);
      }
      if (
        ['cffaedfe', 'cefaedfe', 'cafebabe', 'cafebabf', 'feedface', 'feedfacf'].includes(
          header.toString('hex'),
        )
      )
        found.add(resolved);
    }
  }
  visit(directory);
  return [...found];
}
export function relocate(bundle: string, qtLibraries: string) {
  const frameworks = path.join(bundle, 'Contents/Frameworks');
  const pending = binaries(bundle);
  while (pending.length)
    for (const reference of dependencies(run('otool', ['-L', pending.pop()!]))) {
      if (reference.startsWith('/usr/lib/') || reference.startsWith('/System/Library/')) continue;
      const match = /(Qt[A-Za-z0-9]+\.framework)\/(.*)$/.exec(reference);
      if (match) {
        if (fs.existsSync(path.join(frameworks, match[1]!, match[2]!))) continue;
        const source = path.join(qtLibraries, match[1]!),
          destination = path.join(frameworks, match[1]!);
        if (!fs.existsSync(source) || fs.existsSync(destination))
          throw new Error(`Cannot bundle Qt dependency: ${reference}`);
        copyFramework(source, destination);
        pending.push(...binaries(bundle, destination));
      } else if (reference.startsWith('/') && reference.endsWith('.dylib')) {
        const destination = path.join(frameworks, path.basename(reference));
        if (fs.existsSync(destination)) continue;
        fs.copyFileSync(reference, destination);
        pending.push(destination);
      }
    }
  const checked = binaries(bundle);
  for (const binary of checked) {
    const id = run('otool', ['-D', binary]).split('\n')[1]?.trim();
    if (id)
      run('install_name_tool', [
        '-id',
        inside(frameworks, binary)
          ? '@rpath/' + path.relative(frameworks, binary)
          : '@loader_path/' + path.basename(binary),
        binary,
      ]);
    for (const reference of dependencies(run('otool', ['-L', binary]))) {
      const prefix = '@executable_path/../Frameworks/';
      if (reference.startsWith(prefix)) {
        run('install_name_tool', [
          '-change',
          reference,
          '@rpath/' + reference.slice(prefix.length),
          binary,
        ]);
        continue;
      }
      if (
        !reference.startsWith('/') ||
        reference.startsWith('/usr/lib/') ||
        reference.startsWith('/System/Library/')
      )
        continue;
      const suffix = /([^/]+\.framework\/.*)$/.exec(reference)?.[1] || path.basename(reference);
      if (!fs.existsSync(path.join(frameworks, suffix)))
        throw new Error(`Missing dependency for ${path.basename(binary)}: ${suffix}`);
      run('install_name_tool', ['-change', reference, '@rpath/' + suffix, binary]);
    }
    const rpaths = [
      ...run('otool', ['-l', binary]).matchAll(/cmd LC_RPATH\s+cmdsize \d+\s+path (.*?) \(offset/g),
    ].map((match) => match[1]!);
    for (const value of new Set(rpaths))
      if (
        value.startsWith('/') &&
        !value.startsWith('/usr/lib/') &&
        !value.startsWith('/System/Library/')
      )
        run('install_name_tool', ['-delete_rpath', value, binary]);
    const local = '@loader_path/' + path.relative(path.dirname(binary), frameworks);
    if (!rpaths.includes(local)) run('install_name_tool', ['-add_rpath', local, binary]);
  }
  console.info(`Relocated ${checked.length} bundled binaries.`);
}
export function audit(bundle: string) {
  const frameworks = path.join(bundle, 'Contents/Frameworks'),
    checked = binaries(bundle);
  for (const binary of checked)
    for (const reference of dependencies(run('otool', ['-L', binary]))) {
      if (reference.startsWith('/usr/lib/') || reference.startsWith('/System/Library/')) continue;
      let destination: string;
      if (reference.startsWith('@executable_path/../Frameworks/'))
        throw new Error(`Ambiguous executable-relative dependency: ${reference}`);
      if (reference.startsWith('@rpath/')) destination = path.join(frameworks, reference.slice(7));
      else if (reference.startsWith('@loader_path/'))
        destination = path.join(path.dirname(binary), reference.slice(13));
      else if (reference.startsWith('@executable_path/'))
        destination = path.join(bundle, 'Contents/MacOS', reference.slice(17));
      else throw new Error(`External dependency: ${reference}`);
      if (!fs.existsSync(destination) || !inside(bundle, fs.realpathSync(destination)))
        throw new Error(`Missing bundle dependency: ${reference}`);
    }
  for (const framework of ['QtLabsStyleKit', 'QtWebEngineQuick', 'QtWebEngineCore'])
    if (!fs.existsSync(path.join(frameworks, framework + '.framework')))
      throw new Error(`Missing required framework: ${framework}`);
  console.info(`Bundle audit passed: ${checked.length} binaries.`);
}
