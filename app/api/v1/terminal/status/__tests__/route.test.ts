import { afterEach, describe, expect, it, vi } from "vitest";

const { env } = vi.hoisted(() => ({ env: { DEMO_MODE: false } }));
vi.mock("@/lib/server/env", () => ({ serverEnv: env }));

import { GET } from "@/app/api/v1/terminal/status/route";
import { markInteractiveTerminalAvailable } from "@/lib/server/modules/terminal/availability";

async function status() {
  const response = await GET(new Request("http://localhost"));
  return (await response.json()) as { data: { interactive: boolean } };
}

describe("GET /api/v1/terminal/status", () => {
  afterEach(() => {
    env.DEMO_MODE = false;
    delete (globalThis as Record<string, unknown>).__homeioInteractiveTerminalAvailable;
  });

  it("reports the command terminal where node-pty did not load", async () => {
    expect((await status()).data.interactive).toBe(false);
  });

  it("reports the interactive terminal once the WebSocket server is up", async () => {
    markInteractiveTerminalAvailable();
    expect((await status()).data.interactive).toBe(true);
  });

  it("keeps the shell closed in demo mode", async () => {
    markInteractiveTerminalAvailable();
    env.DEMO_MODE = true;
    expect((await status()).data.interactive).toBe(false);
  });
});
