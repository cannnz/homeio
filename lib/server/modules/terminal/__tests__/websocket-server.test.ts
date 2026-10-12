import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lydell/node-pty", () => ({ spawn: vi.fn() }));
vi.mock("@/lib/server/env", () => ({ serverEnv: {} }));
vi.mock("@/lib/server/modules/auth/cookies", () => ({ getAuthCookieName: () => "session" }));
vi.mock("@/lib/server/modules/auth/service", () => ({ authenticateSession: vi.fn() }));

import {
  buildPtyEnv,
  isSameOriginUpgrade,
  resolveLoginShell,
} from "@/lib/server/modules/terminal/websocket-server";

function upgrade(headers: Record<string, string | undefined>) {
  return { headers } as unknown as IncomingMessage;
}

describe("isSameOriginUpgrade", () => {
  it("lets Homeio's own page open the terminal", () => {
    expect(
      isSameOriginUpgrade(upgrade({ host: "192.168.1.10:3000", origin: "http://192.168.1.10:3000" })),
    ).toBe(true);
  });

  it("refuses another app on the same server (same site, different port)", () => {
    expect(
      isSameOriginUpgrade(upgrade({ host: "192.168.1.10:3000", origin: "http://192.168.1.10:8096" })),
    ).toBe(false);
  });

  it("accepts the public host a tunnel or reverse proxy forwards", () => {
    expect(
      isSameOriginUpgrade(
        upgrade({
          host: "127.0.0.1:3000",
          "x-forwarded-host": "home.example.com",
          origin: "https://home.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("refuses a malformed Origin", () => {
    expect(isSameOriginUpgrade(upgrade({ host: "home", origin: "not a url" }))).toBe(false);
  });

  it("leaves non-browser clients to the session check", () => {
    expect(isSameOriginUpgrade(upgrade({ host: "home" }))).toBe(true);
  });
});

describe("buildPtyEnv", () => {
  it("gives a login shell what systemd leaves out, and no app secrets", () => {
    const saved = { ...process.env };
    try {
      delete process.env.HOME;
      delete process.env.USER;
      delete process.env.PATH;
      process.env.DATABASE_URL = "postgres://secret";
      process.env.AUTH_SESSION_SECRET = "secret";

      const env = buildPtyEnv("/bin/bash");

      expect(env.TERM).toBe("xterm-256color");
      expect(env.HOME).toBeTruthy();
      expect(env.USER).toBeTruthy();
      expect(env.SHELL).toBe("/bin/bash");
      expect(env.PATH).toContain("/usr/bin");
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.AUTH_SESSION_SECRET).toBeUndefined();
    } finally {
      process.env = saved;
    }
  });
});

describe("resolveLoginShell", () => {
  it("picks a shell that exists on this machine", () => {
    expect(resolveLoginShell()).toMatch(/(^|\/)(\w*sh|powershell\.exe)$/);
  });
});
