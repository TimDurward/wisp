import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
export function run(command: string, args: string[], options: ExecFileSyncOptions = {}): string {
  return String(execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe', ...options }));
}
