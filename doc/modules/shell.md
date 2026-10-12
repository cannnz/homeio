# Desktop Shell And Terminal UI

## Purpose

The shell renders Homeio as a desktop-style UI with a dock, windows, command palette, lock screen, status bar, reboot/update overlays, and terminal window.

## Locations

- Server-side terminal WebSocket: `lib/server/modules/terminal/websocket-server.ts`
- Server-side terminal command endpoint: `lib/server/modules/terminal/service.ts`
- Client-side: `modules/shell/`
- Shared UI: `components/providers/`, `lib/ui/surface-tokens.ts`

## Key Files

| File | Role |
|---|---|
| `modules/shell/components/desktop-shell.tsx` | Main shell and window wiring |
| `modules/shell/components/dock.tsx` | Dock item definitions and rendering |
| `modules/shell/components/window.tsx` | Window component |
| `modules/shell/components/command-palette.tsx` | Command palette |
| `modules/shell/components/terminal.tsx` | Terminal window: xterm.js on the `/api/terminal` PTY, falls back to the command terminal |
| `modules/shell/components/command-terminal.tsx` | Command terminal (allowlisted one-off commands) |
| `lib/server/modules/terminal/websocket-server.ts` | `/api/terminal` WebSocket PTY |
| `lib/server/modules/terminal/service.ts` | Allowlisted command execution endpoint |
| `lib/server/modules/terminal/availability.ts` | Whether the PTY loaded in this process |

## Public API

- Components: `DesktopShell`, `Dock`, `Window`, `CommandPalette`, `Terminal`, `CommandTerminal`, `LockScreen`
- Hooks: `useDesktopAppearance()`, `useRebootRecovery()`, `useResolvedWallpaper()`, `useTerminalCommand()`, `useTerminalStatus()`
- Server: `initializeWebSocketServer()`, `executeTerminalCommand()`

## Contracts

- `lib/shared/contracts/terminal.ts`

## Database Tables

Shell state is mostly localStorage-backed through `lib/desktop/`. Terminal has no table.

## API Routes Owned

- WebSocket `/api/terminal` handled in `server.ts` upgrade path
- `POST /api/v1/terminal/execute`
- `GET /api/v1/terminal/status` (whether the PTY terminal is available)

## Known Issues

- `modules/shell/components/desktop-shell.tsx` is over 900 lines and owns too many concerns.
- Window state is spread across multiple `useState` arrays.
- The WebSocket terminal is a full PTY shell (a login shell as the server's user, root on a direct install); the command allowlist applies only to `POST /api/v1/terminal/execute`, which the window uses only where node-pty cannot load (the Alpine Docker image) or in demo mode.
- The WebSocket handshake is refused unless its `Origin` matches `Host` / `X-Forwarded-Host`.
- `WEBSOCKET_ENABLED` exists in env schema but is not used by the audited terminal WebSocket path.

## How To Extend

To add a new desktop window:

1. Add the feature component under `modules/<feature>/`.
2. Add dock metadata in `modules/shell/components/dock.tsx` if it belongs in the dock.
3. Wire window state/rendering in `modules/shell/components/desktop-shell.tsx`.
4. Add command palette entries in `modules/shell/components/command-palette.tsx` if needed.
5. Keep shell changes minimal; flag refactor risk if extending `desktop-shell.tsx` substantially.
