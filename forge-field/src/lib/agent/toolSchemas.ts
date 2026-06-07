import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

// ─── Zod validation schemas ───────────────────────────────────────────────────
// Used server-side to validate LLM tool call inputs before DB execution.

export const UpdateStockSchema = z.object({
  action: z.enum(["IN", "OUT"], {
    errorMap: () => ({ message: "action doit être IN ou OUT" }),
  }),
  items: z
    .array(
      z.object({
        material_id: z.string().uuid("material_id doit être un UUID valide"),
        qty: z
          .number()
          .int()
          .positive("qty doit être un entier positif")
          .max(100_000, "qty dépasse le maximum autorisé"),
      })
    )
    .min(1, "Au moins un item requis")
    .max(50, "Maximum 50 items par opération"),
  chantier_id: z.string().uuid("chantier_id doit être un UUID valide"),
  notes: z.string().max(500).optional(),
});

export const CreateExpenseSchema = z.object({
  amount: z
    .number()
    .positive("Le montant doit être positif")
    .max(100_000, "Montant supérieur au plafond autorisé"),
  category: z.enum(["carburant", "materiau", "repas", "peage", "autre"]),
  chantier_id: z.string().uuid("chantier_id doit être un UUID valide"),
  supplier: z
    .string()
    .min(1, "Le fournisseur est requis")
    .max(255)
    .transform((s) => s.trim()),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date: YYYY-MM-DD")
    .optional(),
  notes: z.string().max(500).optional(),
});

export const DraftVoiceQuoteSchema = z.object({
  raw_transcription: z
    .string()
    .min(10, "Transcription trop courte")
    .max(10_000),
  chantier_context: z.string().max(1000).optional(),
  client_nom: z.string().max(255).optional(),
  taux_marge: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .default(20),
});

export const GenerateLocalSEOPostSchema = z.object({
  chantier_id: z.string().uuid("chantier_id doit être un UUID valide"),
});

export const SearchCatalogSchema = z.object({
  query: z
    .string()
    .min(2, "Requête trop courte")
    .max(200)
    .transform((s) => s.trim()),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

// ─── Anthropic tool definitions ───────────────────────────────────────────────
// These are sent to the Claude API so the LLM knows what functions are available.

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "searchCatalog",
    description:
      "Recherche un matériau dans le catalogue par nom, alias ou code (ex: 'vanne DN50', 'IPN 120', 'boulon de 12'). " +
      "Appelle TOUJOURS cet outil avant updateStock si tu n'as pas de material_id.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Nom ou alias du matériau en langage naturel de terrain",
        },
        limit: {
          type: "number",
          description: "Nombre max de résultats (défaut: 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "updateStock",
    description:
      "Met à jour les quantités en stock. Utilise action='OUT' quand les matériaux partent en chantier, " +
      "action='IN' quand ils rentrent au dépôt. " +
      "Nécessite des material_id valides — utilise searchCatalog d'abord si besoin.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["IN", "OUT"],
          description: "IN = rentrée dépôt, OUT = sortie vers chantier",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              material_id: {
                type: "string",
                description: "UUID du matériau dans le catalogue",
              },
              qty: {
                type: "number",
                description: "Quantité (entier positif)",
              },
            },
            required: ["material_id", "qty"],
          },
          description: "Liste des matériaux et quantités",
        },
        chantier_id: {
          type: "string",
          description: "UUID du chantier concerné",
        },
        notes: {
          type: "string",
          description: "Note optionnelle sur le mouvement",
        },
      },
      required: ["action", "items", "chantier_id"],
    },
  },
  {
    name: "createExpense",
    description:
      "Enregistre une dépense terrain : plein d'essence, achat quincaillerie, repas, péage. " +
      "Le montant est TTC. La date est optionnelle (défaut: aujourd'hui).",
    input_schema: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Montant TTC en euros",
        },
        category: {
          type: "string",
          enum: ["carburant", "materiau", "repas", "peage", "autre"],
          description: "Catégorie de la dépense",
        },
        chantier_id: {
          type: "string",
          description: "UUID du chantier à imputer",
        },
        supplier: {
          type: "string",
          description: "Nom du fournisseur / marchand",
        },
        date: {
          type: "string",
          description: "Date de la dépense au format YYYY-MM-DD (optionnel)",
        },
        notes: {
          type: "string",
          description: "Note complémentaire optionnelle",
        },
      },
      required: ["amount", "category", "chantier_id", "supplier"],
    },
  },
  {
    name: "draftVoiceQuote",
    description:
      "Génère un devis à partir d'une dictée vocale ou d'une description textuelle. " +
      "Extrait les postes, quantités et matériaux, calcule les totaux avec marge.",
    input_schema: {
      type: "object",
      properties: {
        raw_transcription: {
          type: "string",
          description: "Texte brut de la dictée ou description du chantier",
        },
        chantier_context: {
          type: "string",
          description:
            "Contexte complémentaire : type de chantier, contraintes particulières",
        },
        client_nom: {
          type: "string",
          description: "Nom du client pour le devis",
        },
        taux_marge: {
          type: "number",
          description: "Taux de marge en % (défaut: 20)",
        },
      },
      required: ["raw_transcription"],
    },
  },
  {
    name: "generateLocalSEOPost",
    description:
      "Génère une étude de cas SEO local à partir des données d'un chantier clôturé. " +
      "À déclencher automatiquement quand un chantier passe au statut 'cloture'.",
    input_schema: {
      type: "object",
      properties: {
        chantier_id: {
          type: "string",
          description: "UUID du chantier clôturé",
        },
      },
      required: ["chantier_id"],
    },
  },
];
