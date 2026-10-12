"use client";

import "xterm/css/xterm.css";

import { CommandTerminal } from "@/modules/shell/components/command-terminal";
import { useTerminalStatus } from "@/modules/shell/hooks/useTerminalStatus";
import { useEffect, useMemo, useRef } from "react";
import type { ITheme, Terminal as XTerm } from "xterm";

export type TerminalAttachRequest = {
  id: number;
  /** Container to open a shell in; the host shell when null. */
  container: string | null;
} | null;

/** Ubuntu's default terminal colours. */
const UBUNTU_THEME: ITheme = {
  background: "#300a24",
  foreground: "#ffffff",
  cursor: "#ffffff",
  cursorAccent: "#300a24",
  selectionBackground: "#b5d5ff66",
  black: "#2e3436",
  red: "#cc0000",
  green: "#4e9a06",
  yellow: "#c4a000",
  blue: "#3465a4",
  magenta: "#75507b",
  cyan: "#06989a",
  white: "#d3d7cf",
  brightBlack: "#555753",
  brightRed: "#ef2929",
  brightGreen: "#8ae234",
  brightYellow: "#fce94f",
  brightBlue: "#729fcf",
  brightMagenta: "#ad7fa8",
  brightCyan: "#34e2e2",
  brightWhite: "#eeeeec",
};

const RED = "\x1b[1;31m";
const YELLOW = "\x1b[1;33m";
const RESET = "\x1b[0m";

type ServerControlMessage = {
  type: "error" | "pong";
  code?: string;
  message?: string;
};

/**
 * The server sends the shell's output as plain text and its own notices as
 * JSON, so anything that does not parse as one of those is terminal output.
 */
export function parseServerControlMessage(data: string): ServerControlMessage | null {
  if (!data.startsWith('{"type":')) return null;
  try {
    const parsed = JSON.parse(data) as Partial<ServerControlMessage>;
    if (parsed.type === "error" || parsed.type === "pong") {
      return parsed as ServerControlMessage;
    }
  } catch {
    // Shell output that happens to start like JSON.
  }
  return null;
}

export function terminalSocketUrl(location: Pick<Location, "protocol" | "host">) {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:";
  return `${scheme}//${location.host}/api/terminal`;
}

/**
 * The desktop's Terminal window (#58): a real shell on the server, the same
 * one an SSH login would give, so anything that runs in a terminal runs here.
 * Falls back to the command terminal where that is not available.
 */
export function Terminal({
  attachRequest = null,
}: {
  attachRequest?: TerminalAttachRequest;
}) {
  const statusQuery = useTerminalStatus();

  // The command terminal only takes one-off commands, so "Open in Terminal"
  // on a container shows what is in it instead of opening a shell.
  const commandRequest = useMemo(
    () =>
      attachRequest?.container
        ? {
            id: attachRequest.id,
            command: `docker exec ${attachRequest.container} /bin/sh -c "pwd && ls"`,
          }
        : null,
    [attachRequest],
  );

  if (statusQuery.isLoading) {
    return <div className="h-full w-full" style={{ background: UBUNTU_THEME.background }} />;
  }

  if (!statusQuery.data?.interactive) {
    return <CommandTerminal commandRequest={commandRequest} />;
  }

  return <InteractiveTerminal attachRequest={attachRequest} />;
}

function InteractiveTerminal({ attachRequest }: { attachRequest: TerminalAttachRequest }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const attachRef = useRef<((container: string) => void) | null>(null);
  const pendingAttachRef = useRef<string | null>(attachRequest?.container ?? null);
  const lastAttachIdRef = useRef<number | null>(attachRequest?.id ?? null);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      // xterm touches `window` when it loads, so keep it out of the server bundle.
      const [{ Terminal: XTermClass }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
        import("xterm-addon-web-links"),
      ]);
      if (disposed) return;

      const term = new XTermClass({
        cursorBlink: true,
        fontFamily: '"Ubuntu Mono", "DejaVu Sans Mono", "Liberation Mono", Menlo, monospace',
        fontSize: 14,
        lineHeight: 1.1,
        scrollback: 10_000,
        theme: UBUNTU_THEME,
        allowProposedApi: false,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon());
      term.open(host);
      termRef.current = term;

      // Ctrl+C and Ctrl+V belong to the shell, as in Ubuntu's terminal:
      // copy and paste are Ctrl+Shift+C / Ctrl+Shift+V.
      term.attachCustomKeyEventHandler((event) => {
        if (event.type !== "keydown" || !event.ctrlKey || !event.shiftKey) return true;
        if (event.code === "KeyC") {
          const selection = term.getSelection();
          if (selection) void navigator.clipboard?.writeText(selection).catch(() => {});
          return false;
        }
        // Leave the browser's own paste to fire; xterm reads it from there.
        return event.code !== "KeyV";
      });

      let socket: WebSocket | null = null;
      let exited = false;

      const sendResize = () => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
        }
      };

      // A hidden or minimized window has no size to fit to; the shell still
      // gets the current one, and the observer fits again once it shows.
      const fitAndResize = () => {
        if (host.isConnected && host.clientWidth > 0 && host.clientHeight > 0) {
          try {
            fit.fit();
          } catch {
            // Keep the previous size.
          }
        }
        sendResize();
      };

      const sendAttach = (container: string) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "attach", target: container }));
        } else {
          pendingAttachRef.current = container;
        }
      };

      const connect = () => {
        exited = false;
        socket = new WebSocket(terminalSocketUrl(window.location));

        socket.onopen = () => {
          fitAndResize();
          const pending = pendingAttachRef.current;
          pendingAttachRef.current = null;
          if (pending) sendAttach(pending);
          term.focus();
        };

        socket.onmessage = (event: MessageEvent<string>) => {
          const data = typeof event.data === "string" ? event.data : "";
          const control = parseServerControlMessage(data);
          if (!control) {
            term.write(data);
            return;
          }
          if (control.type === "error") {
            term.write(`\r\n${RED}${control.message ?? "Terminal error"}${RESET}\r\n`);
          }
        };

        socket.onclose = () => {
          if (disposed) return;
          exited = true;
          term.write(`\r\n${YELLOW}[Session ended. Press Enter to start a new one.]${RESET}\r\n`);
        };
      };

      const dataSubscription = term.onData((data) => {
        if (exited) {
          if (data === "\r") {
            term.reset();
            connect();
          }
          return;
        }
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "input", data }));
        }
      });

      const resizeObserver = new ResizeObserver(() => fitAndResize());
      resizeObserver.observe(host);
      fitAndResize();
      connect();

      cleanup = () => {
        resizeObserver.disconnect();
        dataSubscription.dispose();
        socket?.close();
        termRef.current = null;
        term.dispose();
      };
      attachRef.current = sendAttach;
    })();

    return () => {
      disposed = true;
      attachRef.current = null;
      cleanup?.();
    };
  }, []);

  // "Open in Terminal" on an app: drop into a shell inside its container.
  useEffect(() => {
    if (!attachRequest || attachRequest.id === lastAttachIdRef.current) return;
    lastAttachIdRef.current = attachRequest.id;
    if (!attachRequest.container) return;
    if (attachRef.current) {
      attachRef.current(attachRequest.container);
    } else {
      pendingAttachRef.current = attachRequest.container;
    }
  }, [attachRequest]);

  return (
    <div
      className="h-full w-full overflow-hidden px-2 pt-1.5"
      style={{ background: UBUNTU_THEME.background }}
      onClick={() => termRef.current?.focus()}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
