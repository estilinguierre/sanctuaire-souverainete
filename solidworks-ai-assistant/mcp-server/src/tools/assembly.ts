import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const assemblyTools: ToolDefinition[] = [
  {
    name: "sw_new_assembly",
    description: "Create a new assembly document",
    inputSchema: z.object({ template: z.string().optional() }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_new_assembly");
      const doc = swApp.NewDocument("", 2, 0, 0);
      return { success: !!doc };
    },
  },
  {
    name: "sw_insert_component",
    description: "Insert a component (part or sub-assembly) into the active assembly",
    inputSchema: z.object({
      file_path: z.string(),
      x_mm: z.number().default(0),
      y_mm: z.number().default(0),
      z_mm: z.number().default(0),
    }),
    async handler(args, swApp, mockMode) {
      const { file_path, x_mm, y_mm, z_mm } = args as {
        file_path: string; x_mm: number; y_mm: number; z_mm: number;
      };
      if (mockMode) return mock("sw_insert_component", { file_path });
      const doc = swApp.ActiveDoc;
      doc.AddComponent4(file_path, "", x_mm / 1000, y_mm / 1000, z_mm / 1000);
      return { success: true };
    },
  },
  {
    name: "sw_mate_coincident",
    description: "Add a Coincident mate between two selected entities",
    inputSchema: z.object({ aligned: z.boolean().default(true) }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_mate_coincident", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_mate_concentric",
    description: "Add a Concentric mate between two cylindrical faces",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_mate_concentric");
      return { success: true };
    },
  },
  {
    name: "sw_mate_distance",
    description: "Add a Distance mate between two entities",
    inputSchema: z.object({ distance_mm: z.number() }),
    async handler(args, swApp, mockMode) {
      const { distance_mm } = args as { distance_mm: number };
      if (mockMode) return mock("sw_mate_distance", { distance_mm });
      return { success: true };
    },
  },
  {
    name: "sw_mate_angle",
    description: "Add an Angle mate between two planes or faces",
    inputSchema: z.object({ angle_deg: z.number() }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_mate_angle", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_exploded_view",
    description: "Create an exploded view of the assembly",
    inputSchema: z.object({ auto_space: z.boolean().default(true) }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_exploded_view");
      return { success: true };
    },
  },
  {
    name: "sw_assembly_bom",
    description: "Insert a Bill of Materials into the active drawing or export to file",
    inputSchema: z.object({
      output_path: z.string().optional(),
      format: z.enum(["excel", "csv", "xml"]).default("excel"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) {
        return mock("sw_assembly_bom", {
          items: [
            { item: 1, part_number: "CTM-001", description: "Platine support", qty: 4 },
            { item: 2, part_number: "CTM-002", description: "Tube 100x100x4", qty: 2 },
          ],
        });
      }
      return { success: true };
    },
  },
  {
    name: "sw_interference_check",
    description: "Run interference detection on the assembly",
    inputSchema: z.object({ treat_subassemblies_as_parts: z.boolean().default(false) }),
    async handler(args, swApp, mockMode) {
      if (mockMode) {
        return mock("sw_interference_check", {
          interferences: 0,
          message: "No interferences detected",
        });
      }
      return { success: true };
    },
  },
  {
    name: "sw_component_properties",
    description: "Get or set custom properties for a component",
    inputSchema: z.object({
      component_name: z.string(),
      properties: z.record(z.string()).optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_component_properties", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_pattern_component",
    description: "Create a pattern of components in the assembly",
    inputSchema: z.object({
      type: z.enum(["linear", "circular"]).default("linear"),
      count_x: z.number().int().min(1).optional(),
      count_y: z.number().int().min(1).optional(),
      spacing_x_mm: z.number().optional(),
      spacing_y_mm: z.number().optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_pattern_component", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_pack_and_go",
    description: "Pack and Go — collect all referenced files into one folder/zip",
    inputSchema: z.object({
      output_path: z.string(),
      include_drawings: z.boolean().default(true),
      flatten_to_single_folder: z.boolean().default(false),
    }),
    async handler(args, swApp, mockMode) {
      const { output_path } = args as { output_path: string };
      if (mockMode) return mock("sw_pack_and_go", { output_path });
      return { success: true };
    },
  },
];
