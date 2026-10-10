import "server-only";

import { listContainers } from "@/lib/server/modules/docker/stats";
import { listContainerCustomizations } from "@/lib/server/modules/docker/container-customizations";
import { listInstalledStacksFromDb } from "@/lib/server/modules/apps/stacks-repository";
import { logServerAction } from "@/lib/server/logging/logger";
import { homeioComponentOf } from "@/lib/server/modules/integrations/cloudflared-connectors";
import {
  parseDockerStatusLine,
  summarizeContainers,
} from "@/lib/shared/app-condition";
import type { UnmanagedContainer } from "@/lib/shared/contracts/docker";

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

export type { UnmanagedContainer };

function toContainerName(names: string[] | undefined, id: string) {
  const first = names?.[0]?.trim() ?? "";
  // Docker prefixes container names with a slash.
  const stripped = first.startsWith("/") ? first.slice(1) : first;
  return stripped.length > 0 ? stripped : id.slice(0, 12);
}

/**
 * Containers running on this host that Homeio did not deploy.
 *
 * Homeio drives its own apps through `docker compose -p <stackName>`, so a
 * container whose compose project matches a known stack is ours. Everything
 * else was started by something else -- CasaOS, Portainer, a bare `docker run`
 * -- and is surfaced read-only for now. Homeio's own components, such as the
 * Cloudflare connector, are neither: they live in Settings.
 */
export async function listUnmanagedContainers(): Promise<UnmanagedContainer[]> {
  const [containers, stacks, customizations] = await Promise.all([
    listContainers(),
    listInstalledStacksFromDb().catch((error) => {
      logServerAction({
        level: "warn",
        layer: "service",
        action: "docker.unmanaged-containers",
        status: "error",
        message: "Could not read installed stacks; treating all containers as unmanaged",
        error,
      });
      return [];
    }),
    listContainerCustomizations(),
  ]);

  const managedProjects = new Set(stacks.map((stack) => stack.stackName));

  return containers
    .filter((container) => {
      if (homeioComponentOf(container)) return false;
      const project = container.Labels?.[COMPOSE_PROJECT_LABEL];
      return !project || !managedProjects.has(project);
    })
    .map((container) => {
      const name = toContainerName(container.Names, container.Id);
      const customization = customizations.get(name);
      return {
        id: container.Id,
        name,
        image: container.Image ?? "",
        state: container.State ?? "unknown",
        status: container.Status ?? "",
        condition: summarizeContainers([
          { state: container.State ?? "unknown", ...parseDockerStatusLine(container.Status ?? "") },
        ]),
        composeProject: container.Labels?.[COMPOSE_PROJECT_LABEL] ?? null,
        displayName: customization?.displayName ?? null,
        iconUrl: customization?.iconUrl ?? null,
        dashboardUrl: customization?.dashboardUrl ?? null,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}
