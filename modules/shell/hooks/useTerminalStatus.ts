"use client";

import { useQuery } from "@tanstack/react-query";

type TerminalStatus = { interactive: boolean };

async function fetchTerminalStatus(): Promise<TerminalStatus> {
  const response = await fetch("/api/v1/terminal/status", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to read terminal status (${response.status})`);
  }
  const json = (await response.json()) as { data: TerminalStatus };
  return json.data;
}

/** Whether the server can run the full interactive terminal. */
export function useTerminalStatus() {
  return useQuery({
    queryKey: ["terminal", "status"] as const,
    queryFn: fetchTerminalStatus,
    staleTime: Infinity,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
