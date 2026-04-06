/**
 * SolidWorks MCP HTTP Server — CTM Industrie
 *
 * Exposes SolidWorks COM automation via REST endpoints.
 * IMPORTANT: Must run bare-metal on Windows with SolidWorks installed.
 * Use MOCK_MODE=true for Linux/CI (returns stub responses).
 */
import express, { Request, Response } from "express";
import { config } from "./config";
import { logger } from "./utils/logger";
import { formatSWError } from "./utils/error_handler";
import { swConnection } from "./solidworks/connection";
import { allTools, toolRegistry } from "./tools/index";

const app = express();
app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/health", async (_req: Request, res: Response) => {
  const connected = await swConnection.isConnected();
  res.json({
    status: connected ? "ok" : "degraded",
    mock_mode: config.mockMode,
    sw_connected: connected,
    tools_count: allTools.length,
    version: "1.0.0",
  });
});

// ---------------------------------------------------------------------------
// List tools
// ---------------------------------------------------------------------------
app.get("/tools", (_req: Request, res: Response) => {
  const tools = allTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: JSON.stringify(t.inputSchema),
  }));
  res.json(tools);
});

// ---------------------------------------------------------------------------
// Execute tool
// ---------------------------------------------------------------------------
app.post("/execute", async (req: Request, res: Response) => {
  const { tool, args = {} } = req.body as { tool: string; args: Record<string, unknown> };

  if (!tool) {
    return res.status(400).json({ error: "Missing 'tool' field in request body" });
  }

  const definition = toolRegistry.get(tool);
  if (!definition) {
    return res.status(404).json({
      error: `Unknown tool: '${tool}'`,
      available_count: allTools.length,
    });
  }

  // Validate input with Zod
  const parsed = definition.inputSchema.safeParse(args);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Invalid arguments",
      details: parsed.error.errors,
    });
  }

  try {
    const swApp = config.mockMode ? null : swConnection.getApp();
    const result = await definition.handler(parsed.data, swApp, config.mockMode);
    logger.info(`✓ ${tool} ${result.success ? "OK" : "FAIL"}`);
    return res.json({ result });
  } catch (err) {
    const message = formatSWError(err);
    logger.error(`✗ ${tool}: ${message}`);
    return res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  if (config.mockMode) {
    logger.warn("MOCK_MODE=true — SolidWorks COM disabled (safe for Linux/CI)");
  } else {
    try {
      await swConnection.connect();
    } catch (err) {
      logger.error(`Failed to connect to SolidWorks: ${err}`);
      logger.warn("Server will start in degraded mode (no SW automation)");
    }
  }

  app.listen(config.port, () => {
    logger.info(
      `MCP Server running on port ${config.port} | ` +
      `${allTools.length} tools | ` +
      `mode=${config.mockMode ? "MOCK" : "LIVE"}`
    );
  });
}

start();
