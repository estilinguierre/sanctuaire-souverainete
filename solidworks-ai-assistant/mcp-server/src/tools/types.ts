import { z } from "zod";

export interface ToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  message?: string;
  vba_macro?: string;
  mock?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<any>;
  handler: (args: unknown, swApp: any, mockMode: boolean) => Promise<ToolResult>;
}
