export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  envVars?: Record<string, string>;
}
