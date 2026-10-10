"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ContainerCustomization } from "@/lib/shared/contracts/docker";

async function putContainerCustomization(
  containerName: string,
  customization: ContainerCustomization,
) {
  const response = await fetch(
    `/api/v1/docker/containers/${encodeURIComponent(containerName)}/customization`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customization),
    },
  );

  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(json?.error ?? `Failed to save settings (${response.status})`);
  }

  const json = (await response.json()) as { data: ContainerCustomization };
  return json.data;
}

/** Save the name, icon and link shown for a container Homeio did not deploy. */
export function useContainerCustomization(containerName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (customization: ContainerCustomization) =>
      putContainerCustomization(containerName, customization),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["docker", "unmanaged-containers"],
      }),
  });
}
