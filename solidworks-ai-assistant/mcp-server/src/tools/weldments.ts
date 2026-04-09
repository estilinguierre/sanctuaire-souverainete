/**
 * Weldments tools — CTM priority category.
 * Structural members, cut lists, profiles for steel structures.
 */
import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const weldmentTools: ToolDefinition[] = [
  {
    name: "sw_weldment_part",
    description: "Activate Weldments on the active part",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_weldment_part");
      swApp.ActiveDoc?.FeatureManager?.InsertWeldmentFeature();
      return { success: true };
    },
  },
  {
    name: "sw_3d_sketch_start",
    description: "Start a new 3D sketch (for weldment layout)",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_3d_sketch_start");
      swApp.ActiveDoc?.SketchManager?.Insert3DSketch(true);
      return { success: true };
    },
  },
  {
    name: "sw_3d_sketch_line",
    description: "Draw a line in the active 3D sketch",
    inputSchema: z.object({
      x1: z.number(), y1: z.number(), z1: z.number(),
      x2: z.number(), y2: z.number(), z2: z.number(),
    }),
    async handler(args, swApp, mockMode) {
      const { x1, y1, z1, x2, y2, z2 } = args as {
        x1: number; y1: number; z1: number;
        x2: number; y2: number; z2: number;
      };
      if (mockMode) return mock("sw_3d_sketch_line", { x1, y1, z1, x2, y2, z2 });
      const sm = swApp.ActiveDoc?.SketchManager;
      sm?.CreateLine(x1 / 1000, y1 / 1000, z1 / 1000, x2 / 1000, y2 / 1000, z2 / 1000);
      return { success: true };
    },
  },
  {
    name: "sw_structural_member",
    description: "Add a structural member profile to a set of sketch segments",
    inputSchema: z.object({
      standard: z.string().default("iso").describe("Profile standard: iso, ansi, etc."),
      type: z.string().describe("Profile type: square tube, c channel, etc."),
      size: z.string().describe("e.g. IPE 100, HEA 200, 100x100x4"),
      rotation_deg: z.number().default(0),
      mirror_profile: z.boolean().default(false),
    }),
    async handler(args, swApp, mockMode) {
      const { standard, type, size } = args as {
        standard: string; type: string; size: string;
      };
      if (mockMode) return mock("sw_structural_member", { standard, type, size });
      const doc = swApp.ActiveDoc;
      const feat = doc.FeatureManager.InsertStructuralWeldment4(
        standard, type, size, 1, null, false, 0, false, false, false
      );
      return { success: !!feat, data: { profile: size } };
    },
  },
  {
    name: "sw_trim_extend",
    description: "Trim/extend structural members at intersections",
    inputSchema: z.object({
      allow_trim: z.boolean().default(true),
      allow_extend: z.boolean().default(true),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_trim_extend");
      return { success: true };
    },
  },
  {
    name: "sw_end_cap",
    description: "Add end caps to open structural member profiles",
    inputSchema: z.object({
      thickness_mm: z.number().positive().default(5),
      inset_mm: z.number().default(0),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_end_cap", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_gusset",
    description: "Add a gusset plate between two structural members",
    inputSchema: z.object({
      thickness_mm: z.number().positive(),
      profile: z.enum(["flat", "angled"]).default("flat"),
      d1_mm: z.number().positive(),
      d2_mm: z.number().positive(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_gusset", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_weld_bead",
    description: "Add a weld bead between two faces",
    inputSchema: z.object({
      weld_size_mm: z.number().positive().default(5),
      weld_type: z.enum(["fillet", "groove", "plug"]).default("fillet"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_weld_bead", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_cutlist_update",
    description: "Update the weldment cut list and recalculate properties",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_cutlist_update");
      const doc = swApp.ActiveDoc;
      doc?.Extension?.UpdateCutList();
      return { success: true };
    },
  },
  {
    name: "sw_cutlist_properties",
    description: "Get all cut list items with length, quantity and material",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) {
        return mock("sw_cutlist_properties", {
          items: [
            { item: 1, description: "IPE 100", length_mm: 3500, quantity: 4, material: "S235" },
            { item: 2, description: "HEA 200", length_mm: 6000, quantity: 2, material: "S235" },
          ],
          total_mass_kg: 312.4,
        });
      }
      return { success: true };
    },
  },
  {
    name: "sw_weldment_bom",
    description: "Export weldment BOM (cut list) to Excel/CSV",
    inputSchema: z.object({
      output_path: z.string(),
      format: z.enum(["excel", "csv"]).default("excel"),
    }),
    async handler(args, swApp, mockMode) {
      const { output_path } = args as { output_path: string };
      if (mockMode) return mock("sw_weldment_bom", { output_path });
      return { success: true };
    },
  },
  {
    name: "sw_profile_library_add",
    description: "Add a custom profile to the weldment profile library",
    inputSchema: z.object({
      profile_name: z.string(),
      sketch_path: z.string().describe("Path to .sldlfp file"),
      standard: z.string().default("CTM-Custom"),
      type: z.string().describe("Profile type category"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_profile_library_add", args as Record<string, unknown>);
      return { success: true };
    },
  },
];
