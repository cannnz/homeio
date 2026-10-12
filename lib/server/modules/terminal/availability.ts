/**
 * Whether the interactive (PTY) terminal is running in this process.
 *
 * server.ts loads the WebSocket terminal on its own and quietly skips it where
 * node-pty cannot load (the Alpine Docker image). Route handlers are bundled
 * separately from server.ts, so the flag lives on globalThis rather than in
 * module state.
 */
const FLAG = "__homeioInteractiveTerminalAvailable";

type FlagHolder = typeof globalThis & { [FLAG]?: boolean };

export function markInteractiveTerminalAvailable() {
  (globalThis as FlagHolder)[FLAG] = true;
}

export function isInteractiveTerminalAvailable() {
  return (globalThis as FlagHolder)[FLAG] === true;
}
