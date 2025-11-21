import { startPreviewProxy, setPreviewProxyLoggingEnabled } from "../apps/client/electron/main/task-run-preview-proxy";

const logger = {
  log: (msg: string, data?: any) => console.log(`[LOG] ${msg}`, data),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data),
};

async function run() {
  setPreviewProxyLoggingEnabled(true);
  const port = await startPreviewProxy(logger);
  console.log(`Proxy running on port ${port}`);
  
  // Keep alive
  await new Promise(() => {});
}

run().catch(console.error);
