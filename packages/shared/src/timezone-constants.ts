/**
 * Shared timezone constants for cmux.
 * Used across server config, Docker compose, and agent spawner.
 *
 * IMPORTANT: When changing DEFAULT_SANDBOX_TIMEZONE, also update:
 * - apps/server/Dockerfile (ENV TZ=...)
 * - apps/server/docker-compose.yml (TZ and DEFAULT_SANDBOX_TIMEZONE defaults)
 */

/**
 * Default timezone for sandboxes when TZ is not set in workspace env vars.
 * This is applied via timedatectl or /etc/localtime symlink on sandbox startup.
 */
export const DEFAULT_SANDBOX_TIMEZONE = "Asia/Hong_Kong";
