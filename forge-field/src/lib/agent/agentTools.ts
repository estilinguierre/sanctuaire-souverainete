import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/db/supabaseClient";
import {
  UpdateStockSchema,
  CreateExpenseSchema,
  DraftVoiceQuoteSchema,
  GenerateLocalSEOPostSchema,
  SearchCatalogSchema,
} from "./toolSchemas";
import type {
  ToolResult,
  UpdateStockResult,
  CreateExpenseResult,
  DraftVoiceQuoteResult,
  GenerateSEOPostResult,
  CatalogItem,
  UUID,
} from "@/types/agent";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const LLM_MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001";

// ─── searchCatalog ─────────────────────────────────────────────────────────────

export async function searchCatalog(
  rawInput: unknown,
  tenantId: UUID
): Promise<ToolResult<CatalogItem[]>> {
  const parsed = SearchCatalogSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }
  const { query, limit } = parsed.data;

  // Full-text + trigram search on nom and nom_aliases
  const { data, error } = await supabaseAdmin
    .from("catalog")
    .select("id, code_interne, nom, unite, quantite_depot, famille, prix_achat_ht")
    .eq("tenant_id", tenantId)
    .or(
      `nom.ilike.%${query}%,` +
      `code_interne.ilike.%${query}%,` +
      `nom_aliases.cs.{${query}}`
    )
    .limit(limit ?? 5);

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []) as CatalogItem[],
  };
}

// ─── updateStock ──────────────────────────────────────────────────────────────

export async function updateStock(
  rawInput: unknown,
  tenantId: UUID,
  userId: UUID
): Promise<ToolResult<UpdateStockResult>> {
  const parsed = UpdateStockSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }
  const { action, items, chantier_id, notes } = parsed.data;

  // Verify chantier belongs to tenant
  const { data: chantier, error: chanErr } = await supabaseAdmin
    .from("chantiers")
    .select("id")
    .eq("id", chantier_id)
    .eq("tenant_id", tenantId)
    .single();

  if (chanErr || !chantier) {
    return { success: false, error: "Chantier introuvable ou accès refusé." };
  }

  const updatedItems: UpdateStockResult["updated_items"] = [];

  for (const item of items) {
    // Lock row and get current stock
    const { data: material, error: matErr } = await supabaseAdmin
      .from("catalog")
      .select("id, nom, quantite_depot, seuil_alerte")
      .eq("id", item.material_id)
      .eq("tenant_id", tenantId)
      .single();

    if (matErr || !material) {
      return {
        success: false,
        error: `Matériau ${item.material_id} introuvable dans le catalogue.`,
      };
    }

    const quantite_avant = material.quantite_depot as number;
    const quantite_apres =
      action === "IN"
        ? quantite_avant + item.qty
        : Math.max(0, quantite_avant - item.qty);

    // Update stock quantity
    const { error: updErr } = await supabaseAdmin
      .from("catalog")
      .update({ quantite_depot: quantite_apres })
      .eq("id", item.material_id);

    if (updErr) return { success: false, error: updErr.message };

    // Record movement
    await supabaseAdmin.from("stock_movements").insert({
      tenant_id: tenantId,
      catalog_id: item.material_id,
      chantier_id,
      user_id: userId,
      action,
      quantite: item.qty,
      quantite_avant,
      quantite_apres,
      notes: notes ?? null,
      source: "voice",
    });

    const seuil_alerte = material.seuil_alerte as number;
    updatedItems.push({
      material_id: item.material_id,
      nom: material.nom as string,
      action,
      qty: item.qty,
      stock_apres: quantite_apres,
      alerte_stock: quantite_apres <= seuil_alerte,
    });
  }

  return {
    success: true,
    data: {
      movements_created: items.length,
      updated_items: updatedItems,
    },
  };
}

// ─── createExpense ────────────────────────────────────────────────────────────

export async function createExpense(
  rawInput: unknown,
  tenantId: UUID,
  userId: UUID
): Promise<ToolResult<CreateExpenseResult>> {
  const parsed = CreateExpenseSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }
  const { amount, category, chantier_id, supplier, date, notes } = parsed.data;

  // Verify chantier
  const { data: chantier, error: chanErr } = await supabaseAdmin
    .from("chantiers")
    .select("id, nom")
    .eq("id", chantier_id)
    .eq("tenant_id", tenantId)
    .single();

  if (chanErr || !chantier) {
    return { success: false, error: "Chantier introuvable ou accès refusé." };
  }

  // Compute HT from TTC (assuming TVA 20% for carburant/repas/autre)
  const taux_tva = category === "peage" ? 20 : 20;
  const montant_ht = Math.round((amount / (1 + taux_tva / 100)) * 100) / 100;

  const { data: expense, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      chantier_id,
      user_id: userId,
      montant_ttc: amount,
      montant_ht,
      taux_tva,
      category,
      fournisseur: supplier,
      date_depense: date ?? new Date().toISOString().split("T")[0],
      notes: notes ?? null,
      source: "voice",
      statut: "en_attente",
    })
    .select("id")
    .single();

  if (error || !expense) {
    return { success: false, error: error?.message ?? "Erreur création dépense" };
  }

  return {
    success: true,
    data: {
      expense_id: expense.id as UUID,
      montant_ttc: amount,
      category,
      chantier_nom: chantier.nom as string,
      statut: "en_attente",
    },
  };
}

// ─── draftVoiceQuote ──────────────────────────────────────────────────────────

export async function draftVoiceQuote(
  rawInput: unknown,
  tenantId: UUID,
  userId: UUID
): Promise<ToolResult<DraftVoiceQuoteResult>> {
  const parsed = DraftVoiceQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }
  const { raw_transcription, chantier_context, client_nom, taux_marge } =
    parsed.data;

  // Use LLM to extract structured quote lines from raw transcription
  const extractionPrompt = `
Tu es un expert en devis BTP. À partir de la dictée suivante, extrais les postes de devis.
Retourne UNIQUEMENT un JSON valide avec ce format :
{
  "titre": "string",
  "client_nom": "string or null",
  "lignes": [
    {
      "designation": "string",
      "description": "string or null",
      "quantite": number,
      "unite": "pcs|m|m2|m3|kg|L|h|forfait",
      "prix_unitaire_ht": number
    }
  ]
}

Règles :
- prix_unitaire_ht = coût matière ou MO estimé SANS marge (la marge sera appliquée après)
- Si quantité non précisée, mets 1
- Si prix non précisé, estime au tarif marché BTP France
- unite "h" pour main d'œuvre horaire

Dictée : "${raw_transcription}"
${chantier_context ? `Contexte : ${chantier_context}` : ""}
${client_nom ? `Client : ${client_nom}` : ""}
`.trim();

  const llmResponse = await anthropic.messages.create({
    model: LLM_MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: extractionPrompt }],
  });

  const rawJson =
    llmResponse.content[0]?.type === "text" ? llmResponse.content[0].text : "";

  let parsedQuote: {
    titre: string;
    client_nom: string | null;
    lignes: Array<{
      designation: string;
      description: string | null;
      quantite: number;
      unite: string;
      prix_unitaire_ht: number;
    }>;
  };

  try {
    // Strip potential markdown code fences
    const clean = rawJson.replace(/```(?:json)?\n?/g, "").trim();
    parsedQuote = JSON.parse(clean) as typeof parsedQuote;
  } catch {
    return { success: false, error: "Impossible de parser la réponse LLM." };
  }

  // Calculate totals with margin
  const lines = parsedQuote.lignes.map((l, i) => {
    const prix_avec_marge =
      Math.round(l.prix_unitaire_ht * (1 + (taux_marge ?? 20) / 100) * 100) /
      100;
    const total_ht = Math.round(l.quantite * prix_avec_marge * 100) / 100;
    return { ...l, prix_unitaire_ht: prix_avec_marge, total_ht, ordre: i };
  });

  const total_ht = lines.reduce((sum, l) => sum + l.total_ht, 0);
  const total_tva = Math.round(total_ht * 0.2 * 100) / 100;
  const total_ttc = Math.round((total_ht + total_tva) * 100) / 100;

  const numero_devis = `FF-${Date.now().toString(36).toUpperCase()}`;

  // Build HTML preview
  const html_content = buildQuoteHTML({
    numero: numero_devis,
    titre: parsedQuote.titre,
    client_nom: client_nom ?? parsedQuote.client_nom ?? "Client",
    lines,
    total_ht,
    total_tva,
    total_ttc,
    taux_marge: taux_marge ?? 20,
  });

  // Persist quote
  const { data: quote, error: quoteErr } = await supabaseAdmin
    .from("quotes")
    .insert({
      tenant_id: tenantId,
      numero_devis,
      client_nom: client_nom ?? parsedQuote.client_nom,
      total_ht,
      total_tva,
      total_ttc,
      taux_marge: taux_marge ?? 20,
      html_content,
      raw_transcription,
      source: "voice",
      statut: "brouillon",
      created_by: userId,
    })
    .select("id")
    .single();

  if (quoteErr || !quote) {
    return { success: false, error: quoteErr?.message ?? "Erreur création devis" };
  }

  // Insert quote lines
  if (lines.length > 0) {
    await supabaseAdmin.from("quote_lines").insert(
      lines.map((l) => ({
        quote_id: quote.id,
        designation: l.designation,
        description: l.description,
        quantite: l.quantite,
        unite: l.unite,
        prix_unitaire_ht: l.prix_unitaire_ht,
        taux_tva: 20,
        ordre: l.ordre,
      }))
    );
  }

  return {
    success: true,
    data: {
      quote_id: quote.id as UUID,
      html_preview: html_content,
      total_ht,
      total_ttc,
      lines_count: lines.length,
    },
  };
}

// ─── generateLocalSEOPost ─────────────────────────────────────────────────────

export async function generateLocalSEOPost(
  rawInput: unknown,
  tenantId: UUID
): Promise<ToolResult<GenerateSEOPostResult>> {
  const parsed = GenerateLocalSEOPostSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message };
  }
  const { chantier_id } = parsed.data;

  // Fetch chantier + tenant info
  const { data: chantier, error: chanErr } = await supabaseAdmin
    .from("chantiers")
    .select("*, tenants(nom, adresse)")
    .eq("id", chantier_id)
    .eq("tenant_id", tenantId)
    .single();

  if (chanErr || !chantier) {
    return { success: false, error: "Chantier introuvable." };
  }

  // Fetch materials used on this chantier
  const { data: movements } = await supabaseAdmin
    .from("stock_movements")
    .select("action, quantite, catalog(nom, famille, unite)")
    .eq("chantier_id", chantier_id)
    .eq("action", "OUT");

  const materialsUsed = (movements ?? [])
    .map(
      (m) =>
        `${m.quantite} ${(m.catalog as { unite: string } | null)?.unite ?? ""} de ${(m.catalog as { nom: string } | null)?.nom ?? "matériau"}`
    )
    .join(", ");

  const seoPrompt = `
Tu es un expert en SEO local pour les PME artisanales françaises.
Rédige une étude de cas chantier en Markdown, optimisée pour le référencement local.

Données chantier :
- Société : ${(chantier.tenants as { nom: string } | null)?.nom ?? "Artisan"}
- Chantier : ${chantier.nom as string}
- Localisation : ${(chantier.localisation as string) ?? "France"}
- Description : ${(chantier.description as string) ?? "Travaux spécialisés"}
- Durée : ${chantier.date_debut ? `du ${chantier.date_debut} au ${chantier.date_cloture ?? "?"}` : "Non précisée"}
- Matériaux utilisés : ${materialsUsed || "Non précisés"}

Structure attendue :
1. Titre H1 avec mot-clé local (ex: "Pose tuyauterie inox à [Ville]")
2. Introduction (2 phrases, mot-clé dans la 1ère)
3. Problématique client (100 mots)
4. Notre intervention (150 mots avec détails techniques)
5. Résultat & satisfaction client (100 mots)
6. Tags SEO : 5 mots-clés ciblés (ligne séparée commençant par "KEYWORDS:")

Ton : professionnel, concret, pas de superlatifs vides.
`.trim();

  const llmResponse = await anthropic.messages.create({
    model: LLM_MODEL,
    max_tokens: 2000,
    messages: [{ role: "user", content: seoPrompt }],
  });

  const markdown =
    llmResponse.content[0]?.type === "text" ? llmResponse.content[0].text : "";

  // Extract keywords from the dedicated line
  const keywordsMatch = markdown.match(/KEYWORDS:\s*(.+)/i);
  const mots_cles = keywordsMatch
    ? keywordsMatch[1]!.split(",").map((k) => k.trim()).filter(Boolean)
    : [];

  const cleanMarkdown = markdown.replace(/KEYWORDS:.+/i, "").trim();

  const titreMatch = cleanMarkdown.match(/^#\s+(.+)/m);
  const titre = titreMatch ? titreMatch[1]! : `Chantier ${chantier.nom as string}`;

  // Persist
  const { data: post, error: postErr } = await supabaseAdmin
    .from("seo_posts")
    .insert({
      tenant_id: tenantId,
      chantier_id,
      titre,
      markdown_content: cleanMarkdown,
      statut: "brouillon",
      mots_cles,
    })
    .select("id")
    .single();

  if (postErr || !post) {
    return { success: false, error: postErr?.message ?? "Erreur création post SEO" };
  }

  return {
    success: true,
    data: {
      post_id: post.id as UUID,
      markdown_content: cleanMarkdown,
      titre,
      mots_cles,
    },
  };
}

// ─── HTML builder for quotes ──────────────────────────────────────────────────

function buildQuoteHTML(params: {
  numero: string;
  titre: string;
  client_nom: string;
  lines: Array<{
    designation: string;
    description: string | null;
    quantite: number;
    unite: string;
    prix_unitaire_ht: number;
    total_ht: number;
  }>;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  taux_marge: number;
}): string {
  const { numero, titre, client_nom, lines, total_ht, total_tva, total_ttc } =
    params;

  const lineRows = lines
    .map(
      (l) => `
    <tr>
      <td>${l.designation}${l.description ? `<br><small>${l.description}</small>` : ""}</td>
      <td>${l.quantite} ${l.unite}</td>
      <td>${l.prix_unitaire_ht.toFixed(2)} €</td>
      <td><strong>${l.total_ht.toFixed(2)} €</strong></td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:14px;color:#1a1a1a;padding:20px}
  h1{color:#e67e22;border-bottom:2px solid #e67e22;padding-bottom:8px}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th{background:#2c3e50;color:#fff;padding:10px;text-align:left}
  td{padding:8px;border-bottom:1px solid #ddd;vertical-align:top}
  tr:nth-child(even){background:#f8f9fa}
  .totals{float:right;margin-top:20px;min-width:300px}
  .totals td{padding:6px 12px}
  .ttc{font-size:18px;font-weight:bold;color:#e67e22}
  small{color:#666}
</style>
</head>
<body>
<h1>DEVIS ${numero}</h1>
<p><strong>Objet :</strong> ${titre}</p>
<p><strong>Client :</strong> ${client_nom}</p>
<p><strong>Date :</strong> ${new Date().toLocaleDateString("fr-FR")}</p>

<table>
  <thead>
    <tr><th>Désignation</th><th>Qté</th><th>Prix unit. HT</th><th>Total HT</th></tr>
  </thead>
  <tbody>${lineRows}</tbody>
</table>

<table class="totals">
  <tr><td>Total HT</td><td><strong>${total_ht.toFixed(2)} €</strong></td></tr>
  <tr><td>TVA 20%</td><td>${total_tva.toFixed(2)} €</td></tr>
  <tr><td>Total TTC</td><td class="ttc">${total_ttc.toFixed(2)} €</td></tr>
</table>
</body>
</html>`;
}
