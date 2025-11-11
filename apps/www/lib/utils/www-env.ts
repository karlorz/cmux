// Re-export from the fallback-enabled version
export {
  env,
  isCriticalEnvConfigured,
  getEnvHealthStatus,
  type EnvHealthStatus,
} from "./env-with-fallback";
