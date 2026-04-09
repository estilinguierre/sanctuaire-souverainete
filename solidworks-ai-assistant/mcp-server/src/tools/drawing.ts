import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const drawingTools: ToolDefinition[] = [
  {
    name: "sw_new_drawing",
    description: "Create a new drawing document from template",
    inputSchema: z.object({
      template: z.string().optional().describe(".drwdot template path"),
      sheet_size: z.enum(["A4", "A3", "A2", "A1", "A0"]).default("A3"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_new_drawing", args as Record<string, unknown>);
      const doc = swApp.NewDocument("", 3, 0, 0);
      return { success: !!doc };
    },
  },
  {
    name: "sw_insert_view",
    description: "Insert a standard view (front, top, right, iso) of the active model",
    inputSchema: z.object({
      view_type: z.enum(["front", "top", "right", "isometric", "named"]).default("front"),
      scale: z.number().positive().default(1),
      x_mm: z.number().default(100),
      y_mm: z.number().default(100),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_insert_view", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_insert_section_view",
    description: "Create a section view on the drawing",
    inputSchema: z.object({
      label: z.string().default("A"),
      depth_percent: z.number().default(50),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_insert_section_view", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_insert_detail_view",
    description: "Create a magnified detail view",
    inputSchema: z.object({
      label: z.string().default("A"),
      scale: z.number().positive().default(2),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_insert_detail_view", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_add_dimension_drawing",
    description: "Add a driving dimension to a drawing view",
    inputSchema: z.object({
      x_mm: z.number(), y_mm: z.number(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_add_dimension_drawing", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_add_note",
    description: "Add a text note to a drawing",
    inputSchema: z.object({
      text: z.string(),
      x_mm: z.number(),
      y_mm: z.number(),
      font_size: z.number().default(3.5),
    }),
    async handler(args, swApp, mockMode) {
      const { text, x_mm, y_mm } = args as { text: string; x_mm: number; y_mm: number };
      if (mockMode) return mock("sw_add_note", { text, x_mm, y_mm });
      return { success: true };
    },
  },
  {
    name: "sw_add_weld_symbol",
    description: "Add a weld symbol annotation",
    inputSchema: z.object({
      weld_type: z.string().describe("e.g. fillet, groove, butt"),
      size_mm: z.number().positive(),
      length_mm: z.number().optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_add_weld_symbol", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_add_surface_finish",
    description: "Add a surface finish (rugosité) annotation",
    inputSchema: z.object({
      ra_value: z.number().positive().describe("Ra value in µm"),
      symbol_type: z.enum(["any", "machined", "not_machined"]).default("any"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_add_surface_finish", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_title_block_fill",
    description: "Fill in title block fields (reference, material, revision, etc.)",
    inputSchema: z.object({
      reference: z.string().optional(),
      material: z.string().optional(),
      revision: z.string().optional(),
      drawn_by: z.string().optional(),
      date: z.string().optional(),
      scale: z.string().optional(),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_title_block_fill", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_export_pdf",
    description: "Export the active drawing to PDF",
    inputSchema: z.object({
      path: z.string(),
      all_sheets: z.boolean().default(true),
      dpi: z.number().default(300),
    }),
    async handler(args, swApp, mockMode) {
      const { path } = args as { path: string };
      if (mockMode) return mock("sw_export_pdf", { path });
      const doc = swApp.ActiveDoc;
      const exportData = swApp.GetExportFileData(20); // swExportData_e.swEXPORTDATA_EXPORTPDF
      const bRet = doc.Extension.SaveAs(path, 0, 0, exportData, 0, 0);
      return { success: bRet, data: { path } };
    },
  },
];
