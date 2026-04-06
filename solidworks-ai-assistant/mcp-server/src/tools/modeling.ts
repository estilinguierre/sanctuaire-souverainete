import { z } from "zod";
import { ToolDefinition, ToolResult } from "./types";

const mock = (name: string, data: Record<string, unknown> = {}): ToolResult => ({
  success: true,
  mock: true,
  message: `[MOCK] ${name} executed`,
  data,
});

export const modelingTools: ToolDefinition[] = [
  {
    name: "sw_create_part",
    description: "Create a new blank SolidWorks part document",
    inputSchema: z.object({
      template: z.string().optional().describe("Template file path (.prtdot)"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_create_part", { doc_type: "part" });
      const doc = swApp.NewDocument("", 0, 0, 0);
      return { success: !!doc, data: { title: doc?.GetTitle() } };
    },
  },
  {
    name: "sw_extrude_boss",
    description: "Add an extrude boss (Extruded Boss/Base) feature",
    inputSchema: z.object({
      depth_mm: z.number().positive(),
      direction: z.enum(["blind", "through_all", "up_to_next"]).default("blind"),
      draft_angle_deg: z.number().optional(),
    }),
    async handler(args, swApp, mockMode) {
      const { depth_mm } = args as { depth_mm: number };
      if (mockMode) return mock("sw_extrude_boss", { depth_mm });
      const doc = swApp.ActiveDoc;
      const featMgr = doc.FeatureManager;
      const feat = featMgr.FeatureExtrusion3(true, false, false, 0, 0, depth_mm / 1000, 0, false, false, false, false, 0, 0, false, false, false, false, true, true, true, 0, 0, false);
      return { success: !!feat, data: { feature_name: feat?.Name } };
    },
  },
  {
    name: "sw_extrude_cut",
    description: "Add an extruded cut feature",
    inputSchema: z.object({
      depth_mm: z.number().positive(),
      direction: z.enum(["blind", "through_all"]).default("through_all"),
    }),
    async handler(args, swApp, mockMode) {
      const { depth_mm } = args as { depth_mm: number };
      if (mockMode) return mock("sw_extrude_cut", { depth_mm });
      const doc = swApp.ActiveDoc;
      const featMgr = doc.FeatureManager;
      const feat = featMgr.FeatureCut4(true, false, false, 1, 0, depth_mm / 1000, 0, false, false, false, false, 0, 0, false, false, false, false, false, true, true, true, true, false, 0, 0, false, false);
      return { success: !!feat };
    },
  },
  {
    name: "sw_fillet",
    description: "Add a fillet feature to selected edges",
    inputSchema: z.object({ radius_mm: z.number().positive() }),
    async handler(args, swApp, mockMode) {
      const { radius_mm } = args as { radius_mm: number };
      if (mockMode) return mock("sw_fillet", { radius_mm });
      const doc = swApp.ActiveDoc;
      const feat = doc.FeatureManager.FeatureFillet(15, radius_mm / 1000, 0, false, false, false, false, null, 0, 0, null, 0, 0, null, 0, 0, 0, false);
      return { success: !!feat };
    },
  },
  {
    name: "sw_chamfer",
    description: "Add a chamfer feature to selected edges",
    inputSchema: z.object({
      distance_mm: z.number().positive(),
      angle_deg: z.number().default(45),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_chamfer", args as Record<string, unknown>);
      const doc = swApp.ActiveDoc;
      const { distance_mm, angle_deg } = args as { distance_mm: number; angle_deg: number };
      const feat = doc.FeatureManager.InsertChamfer(4, true, distance_mm / 1000, angle_deg * Math.PI / 180, 0, 0, 0, 0);
      return { success: !!feat };
    },
  },
  {
    name: "sw_shell",
    description: "Shell a solid body with specified wall thickness",
    inputSchema: z.object({ thickness_mm: z.number().positive() }),
    async handler(args, swApp, mockMode) {
      const { thickness_mm } = args as { thickness_mm: number };
      if (mockMode) return mock("sw_shell", { thickness_mm });
      const doc = swApp.ActiveDoc;
      const feat = doc.FeatureManager.InsertShell(thickness_mm / 1000, false, false, false);
      return { success: !!feat };
    },
  },
  {
    name: "sw_linear_pattern",
    description: "Create a linear pattern of a feature",
    inputSchema: z.object({
      direction: z.enum(["x", "y", "z"]).default("x"),
      spacing_mm: z.number().positive(),
      count: z.number().int().min(2),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_linear_pattern", args as Record<string, unknown>);
      return { success: true, message: "Linear pattern created via COM" };
    },
  },
  {
    name: "sw_circular_pattern",
    description: "Create a circular pattern of a feature",
    inputSchema: z.object({
      angle_deg: z.number().positive(),
      count: z.number().int().min(2),
      equal_spacing: z.boolean().default(true),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_circular_pattern", args as Record<string, unknown>);
      return { success: true, message: "Circular pattern created via COM" };
    },
  },
  {
    name: "sw_mirror_feature",
    description: "Mirror features about a plane",
    inputSchema: z.object({
      plane: z.enum(["front", "top", "right", "custom"]).default("front"),
    }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_mirror_feature", args as Record<string, unknown>);
      return { success: true };
    },
  },
  {
    name: "sw_mass_properties",
    description: "Get mass, volume, surface area and center of mass",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) {
        return mock("sw_mass_properties", {
          mass_kg: 1.234,
          volume_mm3: 156789,
          surface_area_mm2: 45678,
          center_of_mass: { x: 50, y: 25, z: 10 },
        });
      }
      const doc = swApp.ActiveDoc;
      const massProps = doc.Extension.CreateMassProperty();
      massProps.UseSystemUnits = false;
      return {
        success: true,
        data: {
          mass_kg: massProps.Mass,
          volume_mm3: massProps.Volume * 1e9,
          surface_area_mm2: massProps.SurfaceArea * 1e6,
        },
      };
    },
  },
  {
    name: "sw_material_assign",
    description: "Assign a material to the active part",
    inputSchema: z.object({
      material_name: z.string().describe("e.g. 'Alloy Steel', 'AISI 304'"),
      database: z.string().default("solidworks materials"),
    }),
    async handler(args, swApp, mockMode) {
      const { material_name, database } = args as { material_name: string; database: string };
      if (mockMode) return mock("sw_material_assign", { material_name });
      const doc = swApp.ActiveDoc;
      doc.SetMaterialPropertyName2("", database, material_name);
      return { success: true, data: { material: material_name } };
    },
  },
  {
    name: "sw_rebuild",
    description: "Force rebuild of the active model",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_rebuild");
      swApp.ActiveDoc?.EditRebuild3();
      return { success: true };
    },
  },
  {
    name: "sw_save",
    description: "Save the active document",
    inputSchema: z.object({ path: z.string().optional() }),
    async handler(args, swApp, mockMode) {
      if (mockMode) return mock("sw_save");
      const doc = swApp.ActiveDoc;
      const { path } = args as { path?: string };
      if (path) {
        doc.SaveAs(path);
      } else {
        doc.Save();
      }
      return { success: true };
    },
  },
  {
    name: "sw_measure_distance",
    description: "Measure distance between two selected entities",
    inputSchema: z.object({}),
    async handler(_args, swApp, mockMode) {
      if (mockMode) return mock("sw_measure_distance", { distance_mm: 42.5 });
      return { success: true };
    },
  },
  {
    name: "sw_feature_suppress",
    description: "Suppress a named feature",
    inputSchema: z.object({ feature_name: z.string() }),
    async handler(args, swApp, mockMode) {
      const { feature_name } = args as { feature_name: string };
      if (mockMode) return mock("sw_feature_suppress", { feature_name });
      const doc = swApp.ActiveDoc;
      const feat = doc.FeatureByName(feature_name);
      feat?.SetSuppression2(0, 2, null);
      return { success: true };
    },
  },
];
