#!/usr/bin/env node
import { createServer } from "./server.js";

const devshPath = process.env.CMUX_DEVSH_PATH ?? "devsh";

const server = createServer({ devshPath });
server.run().catch((error) => {
  console.error("Failed to start MCP server:", error);
  process.exit(1);
});
