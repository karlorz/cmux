import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

const DEFAULT_BASE_URL = "https://api.kimi.com/coding/v1";
const DEFAULT_SEARCH_URL = "https://api.kimi.com/coding/v1/search";
const DEFAULT_MODEL = "kimi-k2-turbo-preview";
const DEFAULT_MAX_CONTEXT_SIZE = 200000;

type KimiConfig = {
  default_model: string;
  models: Record<
    string,
    {
      provider: string;
      model: string;
      max_context_size: number;
    }
  >;
  providers: Record<
    string,
    {
      type: "kimi";
      base_url: string;
      api_key: string;
    }
  >;
  loop_control: {
    max_steps_per_run: number;
    max_retries_per_step: number;
  };
  services: {
    moonshot_search?: {
      base_url: string;
      api_key: string;
    };
  };
};

export async function getKimiEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  const { Buffer } = await import("node:buffer");

  const env: Record<string, string> = {};
  const files: EnvironmentResult["files"] = [];
  const startupCommands = [
    "mkdir -p $HOME/.kimi",
    "mkdir -p $HOME/.kimi/logs",
  ];

  const apiKey =
    ctx.apiKeys?.KIMI_API_KEY?.trim() ?? process.env.KIMI_API_KEY?.trim();
  const baseUrl = process.env.KIMI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const modelName = process.env.KIMI_MODEL_NAME?.trim() || DEFAULT_MODEL;
  const maxContextEnv = process.env.KIMI_MODEL_MAX_CONTEXT_SIZE?.trim();
  const maxContextSize = Number(maxContextEnv ?? DEFAULT_MAX_CONTEXT_SIZE);

  env.KIMI_BASE_URL = baseUrl;
  env.KIMI_MODEL_NAME = modelName;
  env.KIMI_MODEL_MAX_CONTEXT_SIZE = String(maxContextSize);

  if (apiKey) {
    env.KIMI_API_KEY = apiKey;

    const config: KimiConfig = {
      default_model: modelName,
      models: {
        [modelName]: {
          provider: "kimi-for-coding",
          model: modelName,
          max_context_size: maxContextSize,
        },
      },
      providers: {
        "kimi-for-coding": {
          type: "kimi",
          base_url: baseUrl,
          api_key: apiKey,
        },
      },
      loop_control: {
        max_steps_per_run: 100,
        max_retries_per_step: 3,
      },
      services: {
        moonshot_search: {
          base_url: DEFAULT_SEARCH_URL,
          api_key: apiKey,
        },
      },
    };

    const configJson = JSON.stringify(config, null, 2);
    files.push({
      destinationPath: "$HOME/.kimi/config.json",
      contentBase64: Buffer.from(configJson, "utf-8").toString("base64"),
      mode: "600",
    });
  }

  return {
    files,
    env,
    startupCommands,
  };
}
