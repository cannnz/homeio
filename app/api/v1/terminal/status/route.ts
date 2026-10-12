import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server/modules/auth/api";
import { serverEnv } from "@/lib/server/env";
import { isInteractiveTerminalAvailable } from "@/lib/server/modules/terminal/availability";

export const runtime = "nodejs";

/**
 * GET /api/v1/terminal/status
 *
 * Whether the full interactive terminal (WebSocket at /api/terminal) can be
 * used. When it cannot, the desktop falls back to the command terminal.
 * Response shape: { data: { interactive: boolean } }
 */
export async function GET(request: Request) {
  const apiSession = await requireApiSession(request);
  if (apiSession.response) return apiSession.response;

  return NextResponse.json(
    {
      data: {
        interactive: !serverEnv.DEMO_MODE && isInteractiveTerminalAvailable(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
