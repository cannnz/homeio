import "server-only";

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/server/db/drizzle";
import { containerCustomizations } from "@/lib/server/db/schema";
import { logServerAction, withServerTiming } from "@/lib/server/logging/logger";
import type { ContainerCustomization } from "@/lib/shared/contracts/docker";

export type ContainerCustomizationInput = {
  displayName?: string | null;
  iconUrl?: string | null;
  dashboardUrl?: string | null;
};

function normalize(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function hasContainerCustomizationsTable() {
  const check = await db.execute<{ table_exists: string | null }>(
    sql`SELECT to_regclass('public.container_customizations') AS table_exists`,
  );
  return Boolean(check.rows[0]?.table_exists);
}

/**
 * Every saved customization, keyed by container name. A missing table or a
 * database hiccup must not hide the containers themselves, so both read as
 * "nothing customized".
 */
export async function listContainerCustomizations(): Promise<
  Map<string, ContainerCustomization>
> {
  try {
    if (!(await hasContainerCustomizationsTable())) return new Map();

    const rows = await db.select().from(containerCustomizations);
    return new Map(
      rows.map((row) => [
        row.containerName,
        {
          displayName: row.displayName,
          iconUrl: row.iconUrl,
          dashboardUrl: row.dashboardUrl,
        },
      ]),
    );
  } catch (error) {
    logServerAction({
      level: "warn",
      layer: "service",
      action: "docker.container-customizations.list",
      status: "error",
      message: "Could not read container customizations",
      error,
    });
    return new Map();
  }
}

/**
 * Save the name, icon and link shown for a container. Clearing every field
 * forgets the container, so it falls back to its Docker name and default icon.
 */
export async function saveContainerCustomization(
  containerName: string,
  input: ContainerCustomizationInput,
): Promise<ContainerCustomization> {
  return withServerTiming(
    {
      layer: "service",
      action: "docker.container-customizations.save",
      meta: { containerName },
    },
    async () => {
      if (!(await hasContainerCustomizationsTable())) {
        throw new Error(
          "container_customizations table is missing. Run `npm run db:init`.",
        );
      }

      const values = {
        displayName: normalize(input.displayName),
        iconUrl: normalize(input.iconUrl),
        dashboardUrl: normalize(input.dashboardUrl),
      };

      if (!values.displayName && !values.iconUrl && !values.dashboardUrl) {
        await db
          .delete(containerCustomizations)
          .where(eq(containerCustomizations.containerName, containerName));
        return values;
      }

      await db
        .insert(containerCustomizations)
        .values({ containerName, ...values, updatedAt: sql`NOW()` })
        .onConflictDoUpdate({
          target: containerCustomizations.containerName,
          set: { ...values, updatedAt: sql`NOW()` },
        });

      return values;
    },
  );
}
