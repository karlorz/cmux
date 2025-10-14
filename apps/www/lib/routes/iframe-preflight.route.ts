import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { env } from "@/lib/utils/www-env";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";
import { MorphCloudClient } from "morphcloud";

const ALLOWED_HOST_SUFFIXES = [
  ".cmux.sh",
  ".cmux.dev",
  ".cmux.local",
  ".cmux.localhost",
  ".cmux.app",
  ".autobuild.app",
  ".http.cloud.morph.so",
  ".vm.freestyle.sh",
] as const;

const ALLOWED_EXACT_HOSTS = new Set<string>([
  "cmux.sh",
  "www.cmux.sh",
  "cmux.dev",
  "www.cmux.dev",
  "cmux.local",
  "cmux.localhost",
  "cmux.app",
]);

const DEV_ONLY_HOSTS = new Set<string>(["localhost", "127.0.0.1", "::1"]);

const MORPH_HOST_REGEX = /^port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so$/;

interface MorphUrlComponents {
  morphInstanceId: string;
  port: number;
}

function parseMorphUrl(url: URL): MorphUrlComponents | null {
  const match = url.hostname.match(MORPH_HOST_REGEX);
  if (!match) {
    return null;
  }

  const [, portString, morphId] = match;
  const port = Number.parseInt(portString, 10);

  if (Number.isNaN(port)) {
    return null;
  }

  return {
    morphInstanceId: `morphvm_${morphId}`,
    port,
  };
}

function isAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (ALLOWED_EXACT_HOSTS.has(normalized)) {
    return true;
  }

  if (ALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  const isDevelopment = process.env.NODE_ENV !== "production";

  if (isDevelopment && DEV_ONLY_HOSTS.has(normalized)) {
    return true;
  }

  return false;
}

const QuerySchema = z
  .object({
    url: z
      .string()
      .url()
      .openapi({
        description:
          "Absolute HTTP(S) URL to check before embedding in an iframe.",
      }),
  })
  .openapi("IframePreflightQuery");

const ResponseSchema = z
  .object({
    ok: z.boolean().openapi({
      description:
        "Whether the target responded successfully to the probe request.",
    }),
    status: z
      .number()
      .int()
      .nullable()
      .openapi({ description: "HTTP status code returned by the target." }),
    method: z
      .enum(["HEAD", "GET"])
      .nullable()
      .openapi({
        description: "HTTP method used for the successful probe.",
      }),
    error: z
      .string()
      .optional()
      .openapi({ description: "Error message if the probe failed." }),
  })
  .openapi("IframePreflightResponse");

export const iframePreflightRouter = new OpenAPIHono();

iframePreflightRouter.openapi(
  createRoute({
    method: "get",
    path: "/iframe/preflight",
    tags: ["Iframe"],
    summary: "Validate iframe target availability via server-side preflight.",
    request: {
      query: QuerySchema,
    },
    responses: {
      200: {
        description:
          "Result of the preflight check for the requested iframe URL.",
        content: {
          "application/json": {
            schema: ResponseSchema,
          },
        },
      },
      400: {
        description: "The provided URL was not an HTTP(S) URL.",
      },
      403: {
        description: "The target host is not permitted for probing.",
      },
      401: {
        description: "Request is missing valid authentication.",
      },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Unauthorized",
        },
        401,
      );
    }

    const { url } = c.req.valid("query");
    const target = new URL(url);

    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Only HTTP(S) URLs are supported.",
        },
        400,
      );
    }

    if (target.username || target.password) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Authentication credentials in URL are not supported.",
        },
        400,
      );
    }

    if (!isAllowedHost(target.hostname)) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: `Requests to ${target.hostname} are not permitted.`,
        },
        403,
      );
    }

    const probe = async (method: "HEAD" | "GET") => {
      const response = await fetch(target, {
        method,
        redirect: "manual",
      });
      await response.body?.cancel().catch(() => undefined);
      return response;
    };

    try {
      const headResponse = await probe("HEAD");

      if (headResponse.ok) {
        return c.json({
          ok: true,
          status: headResponse.status,
          method: "HEAD",
        });
      }

      if (headResponse.status === 405) {
        const getResponse = await probe("GET");
        if (getResponse.ok) {
          return c.json({
            ok: true,
            status: getResponse.status,
            method: "GET",
          });
        }

        return c.json({
          ok: false,
          status: getResponse.status,
          method: "GET",
          error: `Request failed with status ${getResponse.status}.`,
        });
      }

      return c.json({
        ok: false,
        status: headResponse.status,
        method: "HEAD",
        error: `Request failed with status ${headResponse.status}.`,
      });
    } catch (error) {
      return c.json({
        ok: false,
        status: null,
        method: null,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during preflight.",
      });
    }
  },
);

// Streaming version that handles instance resuming for Morph URLs
iframePreflightRouter.openapi(
  createRoute({
    method: "get",
    path: "/iframe/preflight-stream",
    tags: ["Iframe"],
    summary: "Stream iframe preflight status with instance resume support.",
    request: {
      query: QuerySchema,
    },
    responses: {
      200: {
        description:
          "Server-sent events stream of preflight status updates, including instance resume attempts.",
        content: {
          "text/event-stream": {
            schema: z.object({
              type: z.enum([
                "loading",
                "resuming",
                "ready",
                "error",
                "instance_not_found",
              ]),
              message: z.string().optional(),
            }),
          },
        },
      },
      401: {
        description: "Request is missing valid authentication.",
      },
      400: {
        description: "The provided URL was not valid.",
      },
      403: {
        description: "The target host is not permitted.",
      },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Unauthorized",
        },
        401,
      );
    }

    const { url } = c.req.valid("query");
    const target = new URL(url);

    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Only HTTP(S) URLs are supported.",
        },
        400,
      );
    }

    if (target.username || target.password) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: "Authentication credentials in URL are not supported.",
        },
        400,
      );
    }

    if (!isAllowedHost(target.hostname)) {
      return c.json(
        {
          ok: false,
          status: null,
          method: null,
          error: `Requests to ${target.hostname} are not permitted.`,
        },
        403,
      );
    }

    return streamSSE(c, async (stream) => {
      const sendEvent = async (type: string, message?: string) => {
        await stream.writeSSE({
          data: JSON.stringify({ type, message }),
          event: "message",
        });
      };

      try {
        await sendEvent("loading", "Checking iframe target...");

        // Check if this is a Morph URL
        const morphComponents = parseMorphUrl(target);

        if (morphComponents) {
          // This is a Morph URL - attempt to resume the instance
          await sendEvent("resuming", "Resuming instance...");

          try {
            const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
            const instance = await client.instances.get({
              instanceId: morphComponents.morphInstanceId,
            });

            // Check the instance state
            const state = (instance as unknown as { state?: string }).state;

            if (state === "paused") {
              // Instance is paused, resume it with retries
              const maxRetries = 3;
              let attempt = 0;
              let resumed = false;

              while (attempt < maxRetries && !resumed) {
                attempt++;
                try {
                  await sendEvent(
                    "resuming",
                    `Resuming instance (attempt ${attempt}/${maxRetries})...`,
                  );
                  await instance.resume();

                  // Wait a moment for the instance to be ready
                  await new Promise((resolve) => setTimeout(resolve, 2000));

                  // Verify the instance is running
                  const updatedInstance = await client.instances.get({
                    instanceId: morphComponents.morphInstanceId,
                  });
                  const updatedState = (
                    updatedInstance as unknown as { state?: string }
                  ).state;

                  if (updatedState === "running") {
                    resumed = true;
                    await sendEvent(
                      "resuming",
                      "Instance resumed successfully, waiting for services...",
                    );
                  }
                } catch (error) {
                  if (attempt >= maxRetries) {
                    await sendEvent(
                      "error",
                      `Failed to resume instance after ${maxRetries} attempts: ${error instanceof Error ? error.message : "Unknown error"}`,
                    );
                    return;
                  }
                  // Wait before retrying
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              }

              if (!resumed) {
                await sendEvent(
                  "error",
                  "Failed to resume instance after multiple attempts",
                );
                return;
              }
            }

            // Instance is running or was successfully resumed
            // Now probe the target URL
            await sendEvent("resuming", "Probing iframe target...");

            const probe = async (method: "HEAD" | "GET") => {
              const response = await fetch(target, {
                method,
                redirect: "manual",
              });
              await response.body?.cancel().catch(() => undefined);
              return response;
            };

            // Try HEAD request first
            const headResponse = await probe("HEAD");

            if (headResponse.ok) {
              await sendEvent("ready", "Iframe target is ready");
              return;
            }

            // If HEAD fails with 405, try GET
            if (headResponse.status === 405) {
              const getResponse = await probe("GET");
              if (getResponse.ok) {
                await sendEvent("ready", "Iframe target is ready");
                return;
              }
              await sendEvent(
                "error",
                `Target responded with status ${getResponse.status}`,
              );
              return;
            }

            await sendEvent(
              "error",
              `Target responded with status ${headResponse.status}`,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              error.message.includes("not found")
            ) {
              await sendEvent(
                "instance_not_found",
                "Instance not found or no longer exists",
              );
            } else {
              await sendEvent(
                "error",
                `Failed to interact with instance: ${error instanceof Error ? error.message : "Unknown error"}`,
              );
            }
          }
        } else {
          // Not a Morph URL - just do a simple probe
          const probe = async (method: "HEAD" | "GET") => {
            const response = await fetch(target, {
              method,
              redirect: "manual",
            });
            await response.body?.cancel().catch(() => undefined);
            return response;
          };

          const headResponse = await probe("HEAD");

          if (headResponse.ok) {
            await sendEvent("ready", "Iframe target is ready");
            return;
          }

          if (headResponse.status === 405) {
            const getResponse = await probe("GET");
            if (getResponse.ok) {
              await sendEvent("ready", "Iframe target is ready");
              return;
            }
            await sendEvent(
              "error",
              `Request failed with status ${getResponse.status}`,
            );
            return;
          }

          await sendEvent(
            "error",
            `Request failed with status ${headResponse.status}`,
          );
        }
      } catch (error) {
        await sendEvent(
          "error",
          error instanceof Error ? error.message : "Unknown error occurred",
        );
      }
    });
  },
);
