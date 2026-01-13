import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { env } from "../_shared/convex-env";

/**
 * Cloudflare AI Gateway configuration.
 */
const CLOUDFLARE_ACCOUNT_ID = "0c1675e0def6de1ab3a50a4e17dc5656";
const CLOUDFLARE_GATEWAY_ID = "cmux-heatmap";

/**
 * Google Cloud project configuration.
 */
const GCP_PROJECT_ID = "manaflow-420907";
const GCP_REGION = "us-east5";

/**
 * Cloudflare AI Gateway base URL for Google Vertex AI.
 */
const CLOUDFLARE_VERTEX_BASE_URL =
  `https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CLOUDFLARE_GATEWAY_ID}/google-vertex-ai/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/publishers/anthropic/models`;

const JSON_HEADERS = {
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Handle private key - convert literal \n if present, otherwise use as-is.
 */
function formatPrivateKey(key: string): string {
  if (key.includes("\\n")) {
    return key.replace(/\\n/g, "\n");
  }
  return key;
}

/**
 * Build the service account JSON for Cloudflare AI Gateway authentication.
 * Cloudflare handles token generation internally when given the service account JSON.
 */
function buildServiceAccountJson(): string {
  const privateKey = env.VERTEX_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("VERTEX_PRIVATE_KEY environment variable is not set");
  }

  const serviceAccount = {
    type: "service_account",
    project_id: GCP_PROJECT_ID,
    private_key_id: "aff18cf6b6f38c0827cba7cb8bd143269560e435",
    private_key: formatPrivateKey(privateKey),
    client_email: "vertex-express@manaflow-420907.iam.gserviceaccount.com",
    client_id: "113976467144405037333",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/vertex-express%40manaflow-420907.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
    // Required by Cloudflare AI Gateway for Vertex AI
    region: GCP_REGION,
  };

  return JSON.stringify(serviceAccount);
}

const TEMPORARY_DISABLE_AUTH = true;

/**
 * Supported Claude models on Vertex AI.
 */
const SUPPORTED_VERTEX_MODELS = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
] as const;

/**
 * Map model names to Vertex AI format.
 * Strips date suffixes (e.g., "-20250929") since Vertex AI expects base model names.
 */
function mapToVertexModel(model: string): string {
  // Strip date suffix (e.g., "claude-sonnet-4-5-20250929" -> "claude-sonnet-4-5")
  const baseModel = model.replace(/-\d{8}$/, "");

  // Check if the base model is supported on Vertex AI
  if (SUPPORTED_VERTEX_MODELS.includes(baseModel as typeof SUPPORTED_VERTEX_MODELS[number])) {
    return baseModel;
  }

  // Default to sonnet if model is not recognized
  console.warn(`[anthropic-proxy] Unknown model "${model}", defaulting to claude-sonnet-4-5`);
  return "claude-sonnet-4-5";
}

/**
 * HTTP action to proxy Anthropic API requests to Vertex AI via Cloudflare AI Gateway.
 * This endpoint is called by Claude Code running in sandboxes.
 */
export const anthropicProxy = httpAction(async (_ctx, req) => {
  const startTime = Date.now();

  // Log incoming request details
  const url = new URL(req.url);
  console.log("[anthropic-proxy] === Incoming Request ===");
  console.log("[anthropic-proxy] Method:", req.method);
  console.log("[anthropic-proxy] URL:", req.url);
  console.log("[anthropic-proxy] Path:", url.pathname);
  console.log("[anthropic-proxy] x-cmux-token present:", !!req.headers.get("x-cmux-token"));
  console.log("[anthropic-proxy] x-api-key present:", !!req.headers.get("x-api-key"));
  console.log("[anthropic-proxy] authorization present:", !!req.headers.get("authorization"));
  console.log("[anthropic-proxy] content-type:", req.headers.get("content-type"));

  // Try to extract token payload for tracking
  const workerAuth = await getWorkerAuth(req, {
    loggerPrefix: "[anthropic-proxy]",
  });
  console.log("[anthropic-proxy] workerAuth result:", workerAuth ? { taskRunId: workerAuth.payload.taskRunId, teamId: workerAuth.payload.teamId } : null);

  if (!TEMPORARY_DISABLE_AUTH && !workerAuth) {
    console.error("[anthropic-proxy] Auth error: Missing or invalid token");
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();

    // Build Cloudflare AI Gateway URL with model and stream suffix
    const requestedModel = body.model ?? "claude-sonnet-4-5";
    const vertexModel = mapToVertexModel(requestedModel);
    const streamSuffix = body.stream ? ":streamRawPredict" : ":rawPredict";
    const cloudflareUrl = `${CLOUDFLARE_VERTEX_BASE_URL}/${vertexModel}${streamSuffix}`;

    console.log("[anthropic-proxy] Model mapping:", requestedModel, "->", vertexModel);
    console.log("[anthropic-proxy] Proxying to Cloudflare AI Gateway:", cloudflareUrl);

    // Build service account JSON for Cloudflare authentication
    const serviceAccountJson = buildServiceAccountJson();
    console.log("[anthropic-proxy] Service account JSON built (length:", serviceAccountJson.length, ")");

    // Build headers - Cloudflare AI Gateway expects service account JSON directly (no Bearer prefix)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: serviceAccountJson,
    };

    // Add anthropic_version required by Vertex AI and remove model (it's in URL)
    const { model: _model, ...bodyWithoutModel } = body;
    const vertexBody = {
      ...bodyWithoutModel,
      anthropic_version: "vertex-2023-10-16",
    };

    console.log("[anthropic-proxy] Request body keys:", Object.keys(vertexBody));

    const response = await fetch(cloudflareUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(vertexBody),
    });

    console.log("[anthropic-proxy] Cloudflare response status:", response.status);

    // Handle streaming responses
    if (body.stream && response.ok) {
      console.log(
        "[anthropic-proxy] Streaming response, latency:",
        Date.now() - startTime,
        "ms"
      );

      const stream = response.body;
      if (!stream) {
        return jsonResponse({ error: "No response body" }, 500);
      }

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Handle non-streaming responses
    const data = await response.json();

    if (!response.ok) {
      console.error("[anthropic-proxy] Cloudflare/Vertex error:", data);
      return jsonResponse(data, response.status);
    }

    console.log(
      "[anthropic-proxy] Success, latency:",
      Date.now() - startTime,
      "ms"
    );

    return jsonResponse(data);
  } catch (error) {
    console.error("[anthropic-proxy] Error:", error);
    return jsonResponse(
      { error: "Failed to proxy request to Vertex AI via Cloudflare" },
      500
    );
  }
});
