import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestId,
  logServerAction,
  withServerTiming,
} from "@/lib/server/logging/logger";
import { saveContainerCustomization } from "@/lib/server/modules/docker/container-customizations";
import { requireApiSession } from "@/lib/server/modules/auth/api";

export const runtime = "nodejs";

/** Docker's own rule for container names. */
const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine(
    (value) => value.length === 0 || /^https?:\/\//i.test(value),
    "Must be an http(s) URL",
  )
  .refine((value) => {
    if (value.length === 0) return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }, "Must be a valid URL")
  .nullable()
  .optional();

const customizationSchema = z.object({
  displayName: z.string().trim().max(80).nullable().optional(),
  iconUrl: httpUrl,
  dashboardUrl: httpUrl,
});

type Context = {
  params: Promise<{
    name: string;
  }>;
};

/**
 * PUT /api/v1/docker/containers/:name/customization
 *
 * Set the name, icon and dashboard link shown for a container Homeio did not
 * deploy. Empty fields fall back to the container's own name and icon.
 * Response shape: { data: ContainerCustomization }
 */
export async function PUT(request: Request, context: Context) {
  const apiSession = await requireApiSession(request);
  if (apiSession.response) return apiSession.response;
  const requestId = createRequestId();
  const { name } = await context.params;

  if (!CONTAINER_NAME_PATTERN.test(name)) {
    return NextResponse.json(
      { error: "Invalid container name", code: "invalid_container_name" },
      { status: 400 },
    );
  }

  try {
    const parsed = customizationSchema.safeParse(await request.json());

    return await withServerTiming(
      {
        layer: "api",
        action: "docker.containers.customization.put",
        requestId,
        meta: { containerName: name, invalidPayload: !parsed.success },
      },
      async () => {
        if (!parsed.success) {
          return NextResponse.json(
            {
              error: "Invalid customization payload",
              issues: parsed.error.flatten(),
            },
            { status: 400 },
          );
        }

        const data = await saveContainerCustomization(name, parsed.data);
        return NextResponse.json({ data });
      },
    );
  } catch (error) {
    logServerAction({
      level: "error",
      layer: "api",
      action: "docker.containers.customization.put.response",
      status: "error",
      requestId,
      message: "Failed to save container customization",
      error,
      meta: { containerName: name },
    });

    return NextResponse.json(
      { error: "Failed to save container customization", code: "internal_error" },
      { status: 500 },
    );
  }
}
