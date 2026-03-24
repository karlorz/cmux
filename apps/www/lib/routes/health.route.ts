import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { env } from "@/lib/utils/www-env";

const PveLxcHealthSchema = z
  .object({
    ok: z.boolean().openapi({
      example: true,
    }),
    apiUrl: z.string().openapi({
      example: "https://pve.example.com:8006",
      description: "PVE API URL (masked for security)",
    }),
    node: z.string().nullable().openapi({
      example: "pve",
      description: "Active PVE node",
    }),
    publicDomain: z.string().nullable().openapi({
      example: "alphasolves.com",
      description: "Public domain for sandbox URLs",
    }),
    containerCount: z.number().optional().openapi({
      example: 5,
      description: "Number of cmux containers running",
    }),
    error: z.string().optional().openapi({
      description: "Error message if not ok",
    }),
    timestamp: z.string().datetime().openapi({
      example: "2024-01-01T00:00:00Z",
    }),
    envConfigured: z.object({
      PVE_API_URL: z.boolean(),
      PVE_API_TOKEN: z.boolean(),
      PVE_NODE: z.boolean(),
      PVE_PUBLIC_DOMAIN: z.boolean(),
    }).openapi({
      description: "Environment variable configuration status",
    }),
  })
  .openapi("PveLxcHealth");

const HealthSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy"]).openapi({
      example: "healthy",
    }),
    timestamp: z.string().datetime().openapi({
      example: "2024-01-01T00:00:00Z",
    }),
    version: z.string().openapi({
      example: "1.0.0",
    }),
    uptime: z.number().openapi({
      example: 3600,
      description: "Uptime in seconds",
    }),
  })
  .openapi("Health");

const SandboxHealthSchema = z
  .object({
    status: z.enum(["healthy", "unhealthy", "degraded"]).openapi({
      example: "healthy",
    }),
    provider: z.string().openapi({
      example: "pve-lxc",
      description: "Active sandbox provider",
    }),
    providerStatus: z.enum(["connected", "disconnected", "error"]).openapi({
      example: "connected",
    }),
    latencyMs: z.number().optional().openapi({
      example: 45,
      description: "API latency in milliseconds",
    }),
    templatesAvailable: z.number().optional().openapi({
      example: 2,
      description: "Number of templates available",
    }),
    error: z.string().optional().openapi({
      description: "Error message if status is unhealthy",
    }),
    timestamp: z.string().datetime().openapi({
      example: "2024-01-01T00:00:00Z",
    }),
  })
  .openapi("SandboxHealth");

const startTime = Date.now();

export const healthRouter = new OpenAPIHono();

healthRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/health",
    tags: ["System"],
    summary: "Health check endpoint",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: HealthSchema,
          },
        },
        description: "Service is healthy",
      },
    },
  }),
  (c) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);

    return c.json(
      {
        status: "healthy" as const,
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        uptime,
      },
      200
    );
  }
);

/**
 * Sandbox provider health check endpoint.
 * Tests connectivity to the active sandbox provider and returns status.
 */
healthRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/health/sandbox",
    tags: ["System"],
    summary: "Sandbox provider health check",
    description: "Tests connectivity to the active sandbox provider (Morph or PVE LXC)",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SandboxHealthSchema,
          },
        },
        description: "Sandbox provider health status",
      },
    },
  }),
  async (c) => {
    const timestamp = new Date().toISOString();

    try {
      const providerInfo = getActiveSandboxProvider();
      const provider = providerInfo.provider;

      if (provider === "pve-lxc") {
        // Test PVE LXC connectivity using healthCheck method
        const startMs = Date.now();
        try {
          const client = getPveLxcClient();
          const health = await client.healthCheck();
          const latencyMs = Date.now() - startMs;

          if (health.ok) {
            return c.json({
              status: "healthy" as const,
              provider,
              providerStatus: "connected" as const,
              latencyMs,
              templatesAvailable: health.containerCount ?? 0,
              timestamp,
            }, 200);
          } else {
            return c.json({
              status: "unhealthy" as const,
              provider,
              providerStatus: "error" as const,
              latencyMs,
              error: health.error ?? "Unknown PVE API error",
              timestamp,
            }, 200);
          }
        } catch (error) {
          const latencyMs = Date.now() - startMs;
          return c.json({
            status: "unhealthy" as const,
            provider,
            providerStatus: "error" as const,
            latencyMs,
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp,
          }, 200);
        }
      } else if (provider === "morph") {
        // Test Morph connectivity
        if (!env.MORPH_API_KEY) {
          return c.json({
            status: "unhealthy" as const,
            provider,
            providerStatus: "disconnected" as const,
            error: "MORPH_API_KEY not configured",
            timestamp,
          }, 200);
        }

        // For Morph, we just verify the API key is configured
        // A full connectivity test would require the morphcloud client
        return c.json({
          status: "healthy" as const,
          provider,
          providerStatus: "connected" as const,
          timestamp,
        }, 200);
      } else {
        return c.json({
          status: "degraded" as const,
          provider: provider || "none",
          providerStatus: "disconnected" as const,
          error: "No sandbox provider configured",
          timestamp,
        }, 200);
      }
    } catch (error) {
      return c.json({
        status: "unhealthy" as const,
        provider: "unknown",
        providerStatus: "error" as const,
        error: error instanceof Error ? error.message : "Failed to detect provider",
        timestamp,
      }, 200);
    }
  }
);

/**
 * Dedicated PVE LXC health check endpoint.
 * Provides detailed diagnostics for troubleshooting production PVE connectivity.
 */
healthRouter.openapi(
  createRoute({
    method: "get" as const,
    path: "/health/pve-lxc",
    tags: ["System"],
    summary: "PVE LXC provider health check",
    description: "Detailed health check for PVE LXC sandbox provider with environment configuration status",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PveLxcHealthSchema,
          },
        },
        description: "PVE LXC health status",
      },
    },
  }),
  async (c) => {
    const timestamp = new Date().toISOString();

    // Environment configuration status
    const envConfigured = {
      PVE_API_URL: Boolean(env.PVE_API_URL),
      PVE_API_TOKEN: Boolean(env.PVE_API_TOKEN),
      PVE_NODE: Boolean(env.PVE_NODE),
      PVE_PUBLIC_DOMAIN: Boolean(env.PVE_PUBLIC_DOMAIN),
    };

    // Check if basic env vars are configured
    if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
      return c.json({
        ok: false,
        apiUrl: env.PVE_API_URL ? maskUrl(env.PVE_API_URL) : "(not configured)",
        node: env.PVE_NODE ?? null,
        publicDomain: env.PVE_PUBLIC_DOMAIN ?? null,
        error: "PVE_API_URL and/or PVE_API_TOKEN not configured",
        timestamp,
        envConfigured,
      }, 200);
    }

    try {
      const client = getPveLxcClient();
      const health = await client.healthCheck();

      return c.json({
        ok: health.ok,
        apiUrl: maskUrl(health.apiUrl),
        node: health.node,
        publicDomain: health.publicDomain,
        containerCount: health.containerCount,
        error: health.error,
        timestamp,
        envConfigured,
      }, 200);
    } catch (error) {
      return c.json({
        ok: false,
        apiUrl: maskUrl(env.PVE_API_URL),
        node: env.PVE_NODE ?? null,
        publicDomain: env.PVE_PUBLIC_DOMAIN ?? null,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp,
        envConfigured,
      }, 200);
    }
  }
);

/**
 * Mask a URL for safe logging (hide credentials/tokens in URL).
 */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Show host and port but nothing sensitive
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "(invalid url)";
  }
}
