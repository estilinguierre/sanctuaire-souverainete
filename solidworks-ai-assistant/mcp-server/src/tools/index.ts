/**
 * Tool registry — aggregates all 90+ SolidWorks tools.
 */
import { ToolDefinition } from "./types";
import { modelingTools } from "./modeling";
import { sketchingTools } from "./sketching";
import { assemblyTools } from "./assembly";
import { drawingTools } from "./drawing";
import { sheetMetalTools } from "./sheet_metal";
import { weldmentTools } from "./weldments";
import { automationTools } from "./automation";

export const allTools: ToolDefinition[] = [
  ...modelingTools,
  ...sketchingTools,
  ...assemblyTools,
  ...drawingTools,
  ...sheetMetalTools,
  ...weldmentTools,
  ...automationTools,
];

export const toolRegistry = new Map<string, ToolDefinition>(
  allTools.map((t) => [t.name, t])
);

export { ToolDefinition };
