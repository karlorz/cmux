import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DevshExecutor, type ExecutorConfig } from "./executor.js";
import {
  TOOL_DEFINITIONS,
  SpawnToolSchema,
  StatusToolSchema,
  WaitToolSchema,
  CancelToolSchema,
  ResultsToolSchema,
  InjectToolSchema,
  CheckpointToolSchema,
  MigrateToolSchema,
  ListToolSchema,
} from "./tools.js";

export interface CmuxMcpServerConfig extends ExecutorConfig {
  name?: string;
  version?: string;
}

/**
 * MCP Server exposing cmux agent orchestration tools
 */
export class CmuxMcpServer {
  private server: Server;
  private executor: DevshExecutor;

  constructor(config: CmuxMcpServerConfig = {}) {
    this.executor = new DevshExecutor(config);

    this.server = new Server(
      {
        name: config.name ?? "cmux-mcp-server",
        version: config.version ?? "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: TOOL_DEFINITIONS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: "object" as const,
            properties: Object.fromEntries(
              Object.entries(tool.inputSchema.shape).map(([key, schema]) => [
                key,
                {
                  type: this.zodTypeToJsonType(schema),
                  description: schema.description,
                },
              ])
            ),
            required: Object.entries(tool.inputSchema.shape)
              .filter(([, schema]) => !schema.isOptional())
              .map(([key]) => key),
          },
        })),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: unknown;

        switch (name) {
          case "cmux_spawn":
            result = await this.executor.spawn(SpawnToolSchema.parse(args));
            break;
          case "cmux_status":
            result = await this.executor.status(StatusToolSchema.parse(args));
            break;
          case "cmux_wait":
            result = await this.executor.wait(WaitToolSchema.parse(args));
            break;
          case "cmux_cancel":
            result = await this.executor.cancel(CancelToolSchema.parse(args));
            break;
          case "cmux_results":
            result = await this.executor.results(ResultsToolSchema.parse(args));
            break;
          case "cmux_inject":
            result = await this.executor.inject(InjectToolSchema.parse(args));
            break;
          case "cmux_checkpoint":
            result = await this.executor.checkpoint(CheckpointToolSchema.parse(args));
            break;
          case "cmux_migrate":
            result = await this.executor.migrate(MigrateToolSchema.parse(args));
            break;
          case "cmux_list":
            result = await this.executor.list(ListToolSchema.parse(args));
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private zodTypeToJsonType(schema: unknown): string {
    // Simple type mapping - can be extended
    const typeName = (schema as { _def?: { typeName?: string } })?._def?.typeName;
    switch (typeName) {
      case "ZodString":
        return "string";
      case "ZodNumber":
        return "number";
      case "ZodBoolean":
        return "boolean";
      case "ZodEnum":
        return "string";
      case "ZodOptional":
        return this.zodTypeToJsonType((schema as { _def?: { innerType?: unknown } })?._def?.innerType);
      case "ZodDefault":
        return this.zodTypeToJsonType((schema as { _def?: { innerType?: unknown } })?._def?.innerType);
      default:
        return "string";
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("cmux MCP server running on stdio");
  }
}

/**
 * Create and return a new MCP server instance
 */
export function createServer(config?: CmuxMcpServerConfig): CmuxMcpServer {
  return new CmuxMcpServer(config);
}
