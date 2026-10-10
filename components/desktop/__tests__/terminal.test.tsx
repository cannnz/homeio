/* @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { statusState, terms } = vi.hoisted(() => ({
  statusState: { isLoading: false, data: { interactive: true } as { interactive: boolean } | undefined },
  terms: [] as Array<{
    written: string[];
    onDataHandler: ((data: string) => void) | null;
  }>,
}));

vi.mock("xterm/css/xterm.css", () => ({}));
vi.mock("@/modules/shell/hooks/useTerminalStatus", () => ({
  useTerminalStatus: () => statusState,
}));
vi.mock("@/modules/shell/components/command-terminal", () => ({
  CommandTerminal: ({ commandRequest }: { commandRequest: { command: string } | null }) => (
    <div>Command terminal {commandRequest?.command ?? ""}</div>
  ),
}));
vi.mock("xterm", () => ({
  Terminal: class {
    cols = 120;
    rows = 30;
    written: string[] = [];
    onDataHandler: ((data: string) => void) | null = null;
    constructor() {
      terms.push(this);
    }
    loadAddon() {}
    open() {}
    focus() {}
    reset() {}
    dispose() {}
    getSelection() {
      return "";
    }
    attachCustomKeyEventHandler() {}
    write(data: string) {
      this.written.push(data);
    }
    onData(handler: (data: string) => void) {
      this.onDataHandler = handler;
      return { dispose() {} };
    }
  },
}));
vi.mock("xterm-addon-fit", () => ({ FitAddon: class { fit() {} } }));
vi.mock("xterm-addon-web-links", () => ({ WebLinksAddon: class {} }));

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
}

import {
  parseServerControlMessage,
  Terminal,
  terminalSocketUrl,
} from "@/modules/shell/components/terminal";

describe("Terminal", () => {
  beforeEach(() => {
    statusState.isLoading = false;
    statusState.data = { interactive: true };
    terms.length = 0;
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a real shell over the WebSocket and shows its output", async () => {
    render(<Terminal />);

    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    const socket = FakeSocket.instances[0];
    expect(socket.url).toBe("ws://localhost:3000/api/terminal");

    act(() => socket.open());
    expect(socket.sent).toContain(JSON.stringify({ type: "resize", cols: 120, rows: 30 }));

    act(() => socket.onmessage?.({ data: "root@home:~# " }));
    expect(terms[0].written).toContain("root@home:~# ");

    terms[0].onDataHandler?.("ls\r");
    expect(socket.sent).toContain(JSON.stringify({ type: "input", data: "ls\r" }));
  });

  it("drops into the container's shell for Open in Terminal", async () => {
    render(<Terminal attachRequest={{ id: 1, container: "jellyfin" }} />);

    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    act(() => FakeSocket.instances[0].open());

    expect(FakeSocket.instances[0].sent).toContain(
      JSON.stringify({ type: "attach", target: "jellyfin" }),
    );
  });

  it("offers a new session after the shell exits", async () => {
    render(<Terminal />);
    await waitFor(() => expect(FakeSocket.instances).toHaveLength(1));
    act(() => FakeSocket.instances[0].open());

    act(() => FakeSocket.instances[0].onclose?.());
    expect(terms[0].written.join("")).toContain("Press Enter to start a new one");

    act(() => terms[0].onDataHandler?.("\r"));
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("falls back to the command terminal where the shell is unavailable", () => {
    statusState.data = { interactive: false };

    render(<Terminal attachRequest={{ id: 1, container: "jellyfin" }} />);

    expect(
      screen.getByText('Command terminal docker exec jellyfin /bin/sh -c "pwd && ls"'),
    ).toBeTruthy();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});

describe("parseServerControlMessage", () => {
  it("reads the server's own notices", () => {
    expect(
      parseServerControlMessage('{"type":"error","code":"unauthorized","message":"Unauthorized"}'),
    ).toEqual({ type: "error", code: "unauthorized", message: "Unauthorized" });
  });

  it("treats everything else as shell output", () => {
    expect(parseServerControlMessage("total 4\r\n")).toBeNull();
    expect(parseServerControlMessage('{"type":"other"}')).toBeNull();
    expect(parseServerControlMessage('{"type": broken')).toBeNull();
  });
});

describe("terminalSocketUrl", () => {
  it("uses wss behind https", () => {
    expect(terminalSocketUrl({ protocol: "https:", host: "home.example.com" })).toBe(
      "wss://home.example.com/api/terminal",
    );
  });
});
