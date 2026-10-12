import { describe, expect, it } from "vitest";
import {
  buildUnmanagedAppItems,
  requireAppActionTarget,
} from "@/modules/apps/components/app-grid-presenters";
import type { UnmanagedContainer } from "@/lib/shared/contracts/docker";

function container(overrides: Partial<UnmanagedContainer>): UnmanagedContainer {
  return {
    id: "abc123",
    name: "jellyfin",
    image: "jellyfin/jellyfin:latest",
    state: "running",
    status: "Up 3 days",
    condition: { condition: "running", exitCode: null },
    composeProject: null,
    displayName: null,
    iconUrl: null,
    dashboardUrl: null,
    ...overrides,
  };
}

describe("buildUnmanagedAppItems", () => {
  it("shows the Docker name and no link until the operator sets them", () => {
    const [item] = buildUnmanagedAppItems([container({})]);

    expect(item.name).toBe("jellyfin");
    expect(item.logoUrl).toBeNull();
    expect(requireAppActionTarget(item, { requireDashboardUrl: true })).toBeNull();
  });

  it("uses the name, icon and link the operator set (#55)", () => {
    const [item] = buildUnmanagedAppItems([
      container({
        displayName: "Media",
        iconUrl: "https://example.com/jellyfin.png",
        dashboardUrl: "http://192.168.1.10:8096",
      }),
    ]);

    expect(item.name).toBe("Media");
    expect(item.logoUrl).toBe("https://example.com/jellyfin.png");
    // Logs, terminal and saving still address the real container.
    expect(item.containerName).toBe("jellyfin");
    expect(requireAppActionTarget(item, { requireDashboardUrl: true })).toEqual({
      appId: "container:abc123",
      appName: "Media",
      dashboardUrl: "http://192.168.1.10:8096",
      containerName: "jellyfin",
      unmanaged: true,
    });
  });
});
