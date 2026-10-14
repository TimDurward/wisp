import { run } from './process.ts';

export function projectVersion(): string {
  const metadata = JSON.parse(
    run(process.env.CARGO || 'cargo', ['metadata', '--no-deps', '--format-version', '1']),
  ) as { packages: { name: string; version: string }[] };
  const version = metadata.packages.find((value) => value.name === 'wisp')?.version;
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error('Wisp must have a valid release version in Cargo.toml.');
  return version;
}

if (import.meta.main) console.info(projectVersion());
