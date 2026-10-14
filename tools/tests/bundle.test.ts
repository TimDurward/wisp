import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaries, copyFramework, dependencies, inside, relocate } from '../macos/bundle.ts';
import { run } from '../process.ts';
test('otool parsing preserves spaces and framework paths', () => {
  expect(
    dependencies(
      'Wisp:\n\t@rpath/QtCore.framework/Versions/A/QtCore (compatibility version 6.0.0, current version 6.11.2)\n\t@loader_path/My Library.dylib (compatibility version 1.0.0)\n',
    ),
  ).toEqual(['@rpath/QtCore.framework/Versions/A/QtCore', '@loader_path/My Library.dylib']);
});
test('containment rejects parent traversal and sibling directories', () => {
  const root = path.resolve('fixture.app');
  expect(inside(root, path.join(root, 'Contents/Frameworks'))).toBe(true);
  expect(inside(root, root + '-other')).toBe(false);
  expect(inside(root, path.resolve(root, '../outside'))).toBe(false);
});

describe('framework deployment', () => {
  let fixture: string;
  beforeEach(() => {
    fixture = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wisp-framework-')));
  });
  afterEach(() => fs.rmSync(fixture, { recursive: true, force: true }));

  test('copies an SDK alias as a self-contained framework', () => {
    const framework = path.join(fixture, 'sdk/QtExample.framework');
    const library = path.join(fixture, 'lib/QtExample.framework');
    const destination = path.join(fixture, 'Wisp.app/Contents/Frameworks/QtExample.framework');
    fs.mkdirSync(path.join(framework, 'Versions/A/Headers'), { recursive: true });
    fs.mkdirSync(path.dirname(library), { recursive: true });
    fs.writeFileSync(path.join(framework, 'Versions/A/QtExample'), 'framework fixture');
    fs.writeFileSync(path.join(framework, 'Versions/A/Headers/Example.h'), 'header fixture');
    fs.writeFileSync(path.join(framework, 'QtExample.prl'), 'linker fixture');
    fs.symlinkSync(framework, library, process.platform === 'win32' ? 'junction' : 'dir');

    copyFramework(library, destination);
    fs.rmSync(path.join(fixture, 'sdk'), { recursive: true });

    expect(fs.lstatSync(destination).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(destination, 'Versions/A/QtExample'), 'utf8')).toBe(
      'framework fixture',
    );
    expect(fs.existsSync(path.join(destination, 'Versions/A/Headers'))).toBe(false);
    expect(fs.existsSync(path.join(destination, 'QtExample.prl'))).toBe(false);
  });

  test.skipIf(process.platform === 'win32')('preserves relative framework version aliases', () => {
    const framework = path.join(fixture, 'sdk/QtExample.framework');
    const destination = path.join(fixture, 'Wisp.app/Contents/Frameworks/QtExample.framework');
    fs.mkdirSync(path.join(framework, 'Versions/A'), { recursive: true });
    fs.writeFileSync(path.join(framework, 'Versions/A/QtExample'), 'framework fixture');
    fs.symlinkSync('A', path.join(framework, 'Versions/Current'));
    fs.symlinkSync('Versions/Current/QtExample', path.join(framework, 'QtExample'));

    copyFramework(framework, destination);
    fs.rmSync(path.join(fixture, 'sdk'), { recursive: true });

    expect(fs.readlinkSync(path.join(destination, 'Versions/Current'))).toBe('A');
    expect(fs.readFileSync(path.join(destination, 'QtExample'), 'utf8')).toBe('framework fixture');
  });

  test.skipIf(process.platform !== 'darwin')(
    'runs independently of the SDK with a transitive shared library',
    () => {
      const sources = fileURLToPath(new URL('fixtures/bundle/', import.meta.url));
      const libraries = path.join(fixture, 'lib');
      const framework = path.join(fixture, 'sdk/QtWispFixture.framework');
      const dependency = path.join(fixture, 'sdk/libwisp-fixture.dylib');
      const dependencyAlias = path.join(libraries, 'libwisp-fixture.dylib');
      const bundle = path.join(fixture, 'Wisp.app');
      const executable = path.join(bundle, 'Contents/MacOS/fixture');
      fs.mkdirSync(libraries, { recursive: true });
      fs.mkdirSync(path.join(framework, 'Versions/A'), { recursive: true });
      fs.mkdirSync(path.dirname(executable), { recursive: true });
      fs.mkdirSync(path.join(bundle, 'Contents/Frameworks'), { recursive: true });
      run('clang++', [
        '-dynamiclib',
        path.join(sources, 'dependency.cpp'),
        '-o',
        dependency,
        `-Wl,-install_name,${dependencyAlias}`,
      ]);
      fs.symlinkSync(dependency, dependencyAlias);
      const frameworkBinary = path.join(framework, 'Versions/A/QtWispFixture');
      run('clang++', [
        '-dynamiclib',
        path.join(sources, 'framework.cpp'),
        dependencyAlias,
        '-o',
        frameworkBinary,
        '-Wl,-install_name,@rpath/QtWispFixture.framework/Versions/A/QtWispFixture',
      ]);
      fs.symlinkSync(framework, path.join(libraries, 'QtWispFixture.framework'));
      run('clang++', [path.join(sources, 'main.cpp'), frameworkBinary, '-o', executable]);

      relocate(bundle, libraries);
      for (const binary of binaries(bundle)) run('codesign', ['--force', '--sign', '-', binary]);
      fs.rmSync(path.join(fixture, 'sdk'), { recursive: true });
      fs.rmSync(libraries, { recursive: true });

      expect(run(executable, []).trim()).toBe('42');
      expect(
        fs.lstatSync(path.join(bundle, 'Contents/Frameworks/libwisp-fixture.dylib')).isFile(),
      ).toBe(true);
    },
  );
});
