import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const sketchingTools: ToolDefinition[] = [
  {
    name: "sw_new_sketch",
    description: "Create a new sketch on a plane or face",
    inputSchema: z.object({
      plane: z.enum(["front", "top", "right", "selected"]).default("front"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_new_sketch", args as Record<string, unknown>);
      swApp.ActiveDoc?.SketchManager?.InsertSketch(true);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_line",
    description: "Draw a line in the active sketch",
    inputSchema: z.object({
      x1: z.number(), y1: z.number(),
      x2: z.number(), y2: z.number(),
    }),
    async handler(args, swApp, mockMode) {
      const { x1, y1, x2, y2 } = args as { x1: number; y1: number; x2: number; y2: number };
      if (mockMode) return mock("sw_sketch_line", { x1, y1, x2, y2 });
      const sm = swApp.ActiveDoc?.SketchManager;
      sm?.CreateLine(x1 / 1000, y1 / 1000, 0, x2 / 1000, y2 / 1000, 0);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_rectangle",
    description: "Draw a rectangle in the active sketch",
    inputSchema: z.object({
      x: z.number().describe("Center X or corner X (mm)"),
      y: z.number().describe("Center Y or corner Y (mm)"),
      width: z.number().positive(),
      height: z.number().positive(),
      mode: z.enum(["corner", "center"]).default("corner"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_sketch_rectangle", args as Record<string, unknown>);
      const { x, y, width, height } = args as { x: number; y: number; width: number; height: number };
      const sm = swApp.ActiveDoc?.SketchManager;
      sm?.CreateCornerRectangle(x / 1000, y / 1000, 0, (x + width) / 1000, (y + height) / 1000, 0);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_circle",
    description: "Draw a circle in the active sketch",
    inputSchema: z.object({
      cx: z.number(), cy: z.number(),
      radius: z.number().positive(),
    }),
    async handler(args, swApp, mockMode) {
      const { cx, cy, radius } = args as { cx: number; cy: number; radius: number };
      if (mockMode) return mock("sw_sketch_circle", { cx, cy, radius });
      const sm = swApp.ActiveDoc?.SketchManager;
      sm?.CreateCircle(cx / 1000, cy / 1000, 0, (cx + radius) / 1000, cy / 1000, 0);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_arc",
    description: "Draw a 3-point arc in the active sketch",
    inputSchema: z.object({
      x1: z.number(), y1: z.number(),
      x2: z.number(), y2: z.number(),
      xmid: z.number(), ymid: z.number(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_sketch_arc", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_polygon",
    description: "Draw a regular polygon",
    inputSchema: z.object({
      cx: z.number(), cy: z.number(),
      sides: z.number().int().min(3),
      circumradius: z.number().positive(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_sketch_polygon", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_sketch_slot",
    description: "Draw a straight slot",
    inputSchema: z.object({
      x1: z.number(), y1: z.number(),
      x2: z.number(), y2: z.number(),
      width: z.number().positive(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_sketch_slot", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_add_dimension",
    description: "Add a smart dimension to selected sketch entity",
    inputSchema: z.object({ value_mm: z.number().positive() }),
    async handler(args, swApp, mockMode) {
      const { value_mm } = args as { value_mm: number };
      if (mockMode) return mock("sw_add_dimension", { value_mm });
      swApp.ActiveDoc?.AddDimension2(0, 0, 0);
      return { success: true };
    },
  },
  {
    name: "sw_add_relation",
    description: "Add a geometric relation between sketch entities",
    inputSchema: z.object({
      relation: z.enum([
        "horizontal", "vertical", "coincident", "parallel",
        "perpendicular", "equal", "symmetric", "tangent",
      ]),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_add_relation", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_convert_entities",
    description: "Convert edges/loops to sketch geometry",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_convert_entities");
      swApp.ActiveDoc?.SketchManager?.SketchUseEdge3(false, false);
      return { success: true };
    },
  },
  {
    name: "sw_offset_entities",
    description: "Offset sketch entities by a distance",
    inputSchema: z.object({
      offset_mm: z.number(),
      reverse: z.boolean().default(false),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_offset_entities", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_close_sketch",
    description: "Exit the active sketch (accept)",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_close_sketch");
      swApp.ActiveDoc?.SketchManager?.InsertSketch(false);
      return { success: true };
    },
  },
];
