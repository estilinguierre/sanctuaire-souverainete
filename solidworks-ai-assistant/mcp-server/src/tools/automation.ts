import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";
import { generateBOMExcelMacro } from "../solidworks/vba_generator";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true, mock: true, message: `[MOCK] ${name}`, data,
});

export const automationTools: ToolDefinition[] = [
  {
    name: "sw_run_macro",
    description: "Run a SolidWorks macro (.swp or .bas file)",
    inputSchema: z.object({
      macro_path: z.string(),
      module_name: z.string().default(""),
      proc_name: z.string().default("main"),
    }),
    async handler(args, swApp, mockMode) {
      const { macro_path, module_name, proc_name } = args as {
        macro_path: string; module_name: string; proc_name: string;
      };
      if (mockMode) return mock("sw_run_macro", { macro_path });
      const error = swApp.RunMacro2(macro_path, module_name, proc_name, 1, 0);
      return { success: error === 0, data: { error_code: error } };
    },
  },
  {
    name: "sw_custom_property_set",
    description: "Set a custom property on the active document or component",
    inputSchema: z.object({
      name: z.string(),
      value: z.string(),
      config: z.string().default("").describe("Configuration name or empty for all"),
    }),
    async handler(args, swApp, mockMode) {
      const { name, value, config } = args as { name: string; value: string; config: string };
      if (mockMode) return mock("sw_custom_property_set", { name, value });
      const doc = swApp.ActiveDoc;
      const mgr = doc.Extension.CustomPropertyManager(config);
      mgr.Set2(name, "", value);
      return { success: true };
    },
  },
  {
    name: "sw_custom_property_get",
    description: "Get a custom property value from the active document",
    inputSchema: z.object({
      name: z.string(),
      config: z.string().default(""),
    }),
    async handler(args, swApp, mockMode) {
      const { name } = args as { name: string };
      if (mockMode) return mock("sw_custom_property_get", { name, value: "CTM-Example" });
      const doc = swApp.ActiveDoc;
      const mgr = doc.Extension.CustomPropertyManager("");
      let val = "";
      mgr.Get5(name, false, val, "", false);
      return { success: true, data: { name, value: val } };
    },
  },
  {
    name: "sw_design_table_create",
    description: "Insert a Design Table (Excel) for configurations",
    inputSchema: z.object({
      excel_path: z.string().optional().describe("Existing Excel file, or leave blank to create"),
      parameters: z.array(z.string()).optional().describe("Parameters to include"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_design_table_create", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_configuration_add",
    description: "Add a new configuration to the active document",
    inputSchema: z.object({
      config_name: z.string(),
      copy_from: z.string().optional().describe("Copy from existing config name"),
    }),
    async handler(args, swApp, mockMode) {
      const { config_name } = args as { config_name: string };
      if (mockMode) return mock("sw_configuration_add", { config_name });
      swApp.ActiveDoc?.ConfigurationManager?.AddConfiguration(config_name, "", "", 0, "", "");
      return { success: true };
    },
  },
  {
    name: "sw_equation_add",
    description: "Add a global equation/variable to the model",
    inputSchema: z.object({
      name: z.string().describe("e.g. LongueurTotal"),
      expression: z.string().describe("e.g. = 200 + 150"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_equation_add", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_export_step",
    description: "Export active model to STEP AP214 format",
    inputSchema: z.object({
      path: z.string(),
      export_reference_geometry: z.boolean().default(false),
    }),
    async handler(args, swApp, mockMode) {
      const { path } = args as { path: string };
      if (mockMode) return mock("sw_export_step", { path });
      const doc = swApp.ActiveDoc;
      const bRet = doc.Extension.SaveAs(path, 0, 0, null, 0, 0);
      return { success: bRet, data: { path } };
    },
  },
  {
    name: "sw_export_stl",
    description: "Export active part to STL for 3D printing",
    inputSchema: z.object({
      path: z.string(),
      quality: z.enum(["coarse", "fine", "custom"]).default("fine"),
      binary: z.boolean().default(true),
    }),
    async handler(args, swApp, mockMode) {
      const { path } = args as { path: string };
      if (mockMode) return mock("sw_export_stl", { path });
      return { success: true, data: { path } };
    },
  },
  {
    name: "sw_generate_bom_excel",
    description: "Generate BOM Excel via VBA macro (fallback for complex assemblies)",
    inputSchema: z.object({ output_path: z.string() }),
    async handler(args, _swApp, mockMode) {
      const { output_path } = args as { output_path: string };
      const macro = generateBOMExcelMacro(output_path);
      if (mockMode) return mock("sw_generate_bom_excel", { output_path, macro_preview: macro.slice(0, 100) });
      return { success: true, vba_macro: macro };
    },
  },
  {
    name: "sw_feature_unsuppress",
    description: "Unsuppress a named feature",
    inputSchema: z.object({ feature_name: z.string() }),
    async handler(args, swApp, mockMode) {
      const { feature_name } = args as { feature_name: string };
      if (mockMode) return mock("sw_feature_unsuppress", { feature_name });
      const feat = swApp.ActiveDoc?.FeatureByName(feature_name);
      feat?.SetSuppression2(1, 2, null);
      return { success: true };
    },
  },
];
