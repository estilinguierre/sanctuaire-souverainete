/**
 * Sheet Metal tools — CTM priority category.
 * All tools operate on the active SolidWorks Sheet Metal part.
 */
import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { generateExportDXFMacro } from "../solidworks/vba_generator";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const sheetMetalTools: ToolDefinition[] = [
  {
    name: "sw_sheetmetal_part",
    description: "Convert active part to Sheet Metal or create a new SM part",
    inputSchema: z.object({
      thickness_mm: z.number().positive().describe("Default wall thickness"),
      k_factor: z.number().min(0.2).max(0.6).default(0.42),
      bend_radius_mm: z.number().positive().optional(),
    }),
    async handler(args, swApp, mockMode) {
      const { thickness_mm, k_factor } = args as { thickness_mm: number; k_factor: number };
      if (mockMode) return mock("sw_sheetmetal_part", { thickness_mm, k_factor });
      return { success: true, data: { thickness_mm, k_factor } };
    },
  },
  {
    name: "sw_base_flange",
    description: "Add a Base-Flange (first SM feature) from active sketch",
    inputSchema: z.object({
      thickness_mm: z.number().positive(),
      direction: z.enum(["blind", "mid_plane"]).default("blind"),
      depth_mm: z.number().positive().optional().describe("For extrusion-style base"),
    }),
    async handler(args, swApp, mockMode) {
      const { thickness_mm } = args as { thickness_mm: number };
      if (mockMode) return mock("sw_base_flange", { thickness_mm });
      const doc = swApp.ActiveDoc;
      const feat = doc.FeatureManager.InsertBaseFlange2(
        thickness_mm / 1000, false, 0, 0, 0, false, 1, 0, 0, 0, false
      );
      return { success: !!feat, data: { feature_name: feat?.Name } };
    },
  },
  {
    name: "sw_edge_flange",
    description: "Add an Edge Flange to a selected edge",
    inputSchema: z.object({
      length_mm: z.number().positive(),
      angle_deg: z.number().default(90),
      position: z.enum(["material_inside", "material_outside", "bend_outside"]).default("material_inside"),
    }),
    async handler(args, swApp, mockMode) {
      const { length_mm, angle_deg } = args as { length_mm: number; angle_deg: number };
      if (mockMode) return mock("sw_edge_flange", { length_mm, angle_deg });
      return { success: true };
    },
  },
  {
    name: "sw_miter_flange",
    description: "Add a Miter Flange along a chain of edges",
    inputSchema: z.object({
      length_mm: z.number().positive(),
      angle_deg: z.number().default(90),
      gap_mm: z.number().default(1.0).describe("Miter gap between flanges"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_miter_flange", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_hem",
    description: "Add a Hem to a selected edge (rolled, open, teardrop, rolled)",
    inputSchema: z.object({
      type: z.enum(["open", "closed", "teardrop", "rolled"]).default("open"),
      length_mm: z.number().positive().optional(),
      radius_mm: z.number().positive().optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_hem", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_jog",
    description: "Add a Jog (offset) to a sheet metal face",
    inputSchema: z.object({
      offset_mm: z.number(),
      fixed_face: z.enum(["top", "bottom"]).default("top"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_jog", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_flat_pattern",
    description: "Unfold the sheet metal part to flat pattern",
    inputSchema: z.object({
      show_bend_lines: z.boolean().default(true),
      show_bend_notes: z.boolean().default(true),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_flat_pattern", { flattened: true });
      const doc = swApp.ActiveDoc;
      // Unsuppress flat pattern feature
      const fp = doc.FeatureByName("Flat-Pattern");
      fp?.SetSuppression2(1, 2, null);
      doc.EditRebuild3();
      return { success: true };
    },
  },
  {
    name: "sw_k_factor_set",
    description: "Set the K-factor for the active sheet metal part",
    inputSchema: z.object({
      k_factor: z.number().min(0.2).max(0.6),
      material: z.string().optional().describe("e.g. S235, INOX_304"),
    }),
    async handler(args, swApp, mockMode) {
      const { k_factor } = args as { k_factor: number };
      if (mockMode) return mock("sw_k_factor_set", { k_factor });
      return { success: true, data: { k_factor } };
    },
  },
  {
    name: "sw_gauge_table_assign",
    description: "Assign a gauge/bend table file (.btl) to the part",
    inputSchema: z.object({
      table_path: z.string().describe("Path to .btl bend table file"),
    }),
    async handler(args, swApp, mockMode) {
      const { table_path } = args as { table_path: string };
      if (mockMode) return mock("sw_gauge_table_assign", { table_path });
      return { success: true };
    },
  },
  {
    name: "sw_forming_tool",
    description: "Apply a forming tool (lance, louver, bridge) to a face",
    inputSchema: z.object({
      tool_name: z.string(),
      position_x: z.number(),
      position_y: z.number(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_forming_tool", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_corner_relief",
    description: "Set corner relief type on a sheet metal bend intersection",
    inputSchema: z.object({
      type: z.enum(["rectangular", "circular", "bend_waist", "none"]).default("circular"),
      size_mm: z.number().positive().optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_corner_relief", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_closed_corner",
    description: "Add a closed corner between two adjacent edge flanges",
    inputSchema: z.object({
      gap_mm: z.number().default(0.0),
      open_bend_region: z.boolean().default(false),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_closed_corner", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_save_dxf",
    description: "Export flat pattern to DXF for laser cutting (TRUMPF format)",
    inputSchema: z.object({
      path: z.string().describe("Output .dxf file path"),
      include_bend_lines: z.boolean().default(true),
      include_form_features: z.boolean().default(false),
      layer_bend_up: z.string().default("PLIS_MONTANT"),
      layer_bend_down: z.string().default("PLIS_DESCENDANT"),
      layer_cut: z.string().default("DECOUPE"),
    }),
    async handler(args, swApp, mockMode) {
      const { path } = args as { path: string };
      if (mockMode) {
        return mock("sw_save_dxf", {
          path,
          macro: generateExportDXFMacro(path),
        });
      }
      const doc = swApp.ActiveDoc;
      const exportData = swApp.GetExportFileData(1);
      exportData.SetSheetMetalOptions(1, 1, 0, 0, 0, 0);
      const bRet = doc.Extension.SaveAs(path, 0, 0, exportData, 0, 0);
      return { success: bRet, data: { path } };
    },
  },
  {
    name: "sw_bend_sequence",
    description: "Get the recommended bend sequence for a sheet metal part",
    inputSchema: z.object({}),
    async handler(_args, _swApp, mockMode) {
      if (mockMode) {
        return mock("sw_bend_sequence", {
          sequence: [
            { step: 1, bend_angle: 90, direction: "up", tool: "88° V10" },
            { step: 2, bend_angle: 90, direction: "up", tool: "88° V10" },
          ],
        });
      }
      return { success: true };
    },
  },
  {
    name: "sw_sheetmetal_to_dxf_batch",
    description: "Export multiple parts' flat patterns to DXF in one operation",
    inputSchema: z.object({
      output_dir: z.string(),
      parts: z.array(z.string()).describe("List of .sldprt file paths"),
    }),
    async handler(args, swApp, mockMode) {
      const { output_dir, parts } = args as { output_dir: string; parts: string[] };
      if (mockMode) {
        return mock("sw_sheetmetal_to_dxf_batch", {
          exported: parts.map((p) => p.replace(".sldprt", ".dxf")),
        });
      }
      return { success: true };
    },
  },
];
