// The package ships its own types, but its package.json "exports" hides them
// from TypeScript. The module's exports are named (spawn, ...), no default:
// `import * as pty from "@lydell/node-pty"`.
declare module "@lydell/node-pty" {
  export type IPty = {
    onData(callback: (data: string) => void): void;
    onExit(callback: (exitCode: { exitCode: number; signal?: number }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(): void;
  };

  export type IPtyForkOptions = {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
  };

  export function spawn(file: string, args: string[], options?: IPtyForkOptions): IPty;
}
