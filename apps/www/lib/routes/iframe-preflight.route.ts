import { getAccessTokenFromRequest } from "@/lib/utils/auth";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { streamText } from "hono/streaming";
import { MorphCloudClient } from "morphcloud";
import { env } from "@/lib/utils/www-env";

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

function isMorphUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname.endsWith(".http.cloud.morph.so") ||
      hostname.endsWith(".vm.freestyle.sh")
    );
  } catch {
    return false;
  }
}

function getInstanceId(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (hostname.endsWith(".http.cloud.morph.so")) {
      return hostname.replace(".http.cloud.morph.so", "");
    }
    if (hostname.endsWith(".vm.freestyle.sh")) {
      return hostname.replace(".vm.freestyle.sh", "");
    }
    return null;
  } catch {
    return null;
  }
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

iframePreflightRouter.get("/iframe/preflight", async (c) => {
  const accessToken = await getAccessTokenFromRequest(c.req.raw);
  if (!accessToken) {
    return c.text("Unauthorized", 401);
  }

  const { url } = c.req.query();
  if (!url) {
    return c.text("Missing url parameter", 400);
  }

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return c.text("Invalid URL", 400);
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return c.text("Only HTTP(S) URLs are supported.", 400);
  }

  if (target.username || target.password) {
    return c.text("Authentication credentials in URL are not supported.", 400);
  }

  if (!isAllowedHost(target.hostname)) {
    return c.text(`Requests to ${target.hostname} are not permitted.`, 403);
  }

  return streamText(async (stream) => {
    if (isMorphUrl(url)) {
      const instanceId = getInstanceId(url);
      if (!instanceId) {
        await stream.writeln(JSON.stringify({ status: "couldn't find instance" }));
        return;
      }

      const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
      let instance;
      try {
        instance = await client.instances.get({ instanceId });
      } catch (e) {
        await stream.writeln(JSON.stringify({ status: "couldn't find instance" }));
        return;
      }

      await stream.writeln(JSON.stringify({ status: "resuming iframe" }));

      const maxRetries = 3;
      let success = false;
      for (let i = 0; i < maxRetries; i++) {
        try {
          await instance.resume();
          success = true;
          break;
        } catch (e) {
          if (i === maxRetries - 1) {
            await stream.writeln(JSON.stringify({ status: "failed to resume, even after retries" }));
            return;
          }
        }
      }

      if (!success) {
        return;
      }

      // Probe after resume
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
          await stream.writeln(JSON.stringify({ status: "iframe ready", ok: true, status: headResponse.status, method: "HEAD" }));
          return;
        }

        if (headResponse.status === 405) {
          const getResponse = await probe("GET");
          if (getResponse.ok) {
            await stream.writeln(JSON.stringify({ status: "iframe ready", ok: true, status: getResponse.status, method: "GET" }));
            return;
          }

          await stream.writeln(JSON.stringify({ status: "error", ok: false, status: getResponse.status, method: "GET", error: `Request failed with status ${getResponse.status}.` }));
          return;
        }

        await stream.writeln(JSON.stringify({ status: "error", ok: false, status: headResponse.status, method: "HEAD", error: `Request failed with status ${headResponse.status}.` }));
      } catch (error) {
        await stream.writeln(JSON.stringify({ status: "error", ok: false, status: null, method: null, error: error instanceof Error ? error.message : "Unknown error during preflight." }));
      }
    } else {
      // Normal preflight
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
          await stream.writeln(JSON.stringify({ status: "iframe ready", ok: true, status: headResponse.status, method: "HEAD" }));
          return;
        }

        if (headResponse.status === 405) {
          const getResponse = await probe("GET");
          if (getResponse.ok) {
            await stream.writeln(JSON.stringify({ status: "iframe ready", ok: true, status: getResponse.status, method: "GET" }));
            return;
          }

          await stream.writeln(JSON.stringify({ status: "error", ok: false, status: getResponse.status, method: "GET", error: `Request failed with status ${getResponse.status}.` }));
          return;
        }

        await stream.writeln(JSON.stringify({ status: "error", ok: false, status: headResponse.status, method: "HEAD", error: `Request failed with status ${headResponse.status}.` }));
      } catch (error) {
        await stream.writeln(JSON.stringify({ status: "error", ok: false, status: null, method: null, error: error instanceof Error ? error.message : "Unknown error during preflight." }));
      }
    }
  });
});
