import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/modules/docker/container-customizations", () => ({
  saveContainerCustomization: vi.fn(),
}));

import { PUT } from "@/app/api/v1/docker/containers/[name]/customization/route";
import { saveContainerCustomization } from "@/lib/server/modules/docker/container-customizations";

function put(name: string, body: unknown) {
  return PUT(
    new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ name }) },
  );
}

describe("PUT /api/v1/docker/containers/:name/customization", () => {
  beforeEach(() => {
    vi.mocked(saveContainerCustomization).mockReset();
  });

  it("saves the name, icon and dashboard link", async () => {
    const saved = {
      displayName: "Jellyfin",
      iconUrl: "https://example.com/jellyfin.png",
      dashboardUrl: "http://192.168.1.10:8096",
    };
    vi.mocked(saveContainerCustomization).mockResolvedValueOnce(saved);

    const response = await put("jellyfin", saved);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: saved });
    expect(saveContainerCustomization).toHaveBeenCalledWith("jellyfin", saved);
  });

  it("accepts cleared fields so the container falls back to its defaults", async () => {
    const cleared = { displayName: null, iconUrl: null, dashboardUrl: null };
    vi.mocked(saveContainerCustomization).mockResolvedValueOnce(cleared);

    const response = await put("jellyfin", { displayName: "", iconUrl: "", dashboardUrl: "" });

    expect(response.status).toBe(200);
    expect(saveContainerCustomization).toHaveBeenCalledWith("jellyfin", {
      displayName: "",
      iconUrl: "",
      dashboardUrl: "",
    });
  });

  it("rejects a link that is not http(s)", async () => {
    const response = await put("jellyfin", { dashboardUrl: "javascript:alert(1)" });

    expect(response.status).toBe(400);
    expect(saveContainerCustomization).not.toHaveBeenCalled();
  });

  it("rejects a name Docker would never give a container", async () => {
    const response = await put("../etc", { displayName: "x" });

    expect(response.status).toBe(400);
    expect(saveContainerCustomization).not.toHaveBeenCalled();
  });
});
