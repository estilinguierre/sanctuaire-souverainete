-- ============================================================
-- FORGE FIELD — Core Schema v1
-- Migration: 001_core_schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- fuzzy text search
-- CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for embeddings (enable in Supabase dashboard)

-- ─── TENANTS (Multi-tenant isolation) ───────────────────────
CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                     VARCHAR(255) NOT NULL,
    siret                   VARCHAR(14),
    tva_intracommunautaire  VARCHAR(20),
    adresse                 TEXT,
    telephone               VARCHAR(20),
    email_contact           VARCHAR(255),
    logo_url                TEXT,
    taux_marge_defaut       DECIMAL(5,2) DEFAULT 20.00,
    plan                    VARCHAR(50) DEFAULT 'starter',  -- starter, pro, business
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USERS ──────────────────────────────────────────────────
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       VARCHAR(255) UNIQUE NOT NULL,
    nom         VARCHAR(100),
    prenom      VARCHAR(100),
    role        VARCHAR(50) DEFAULT 'employe',
    -- employe | chef_chantier | comptable | admin
    avatar_url  TEXT,
    actif       BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CHANTIERS ──────────────────────────────────────────────
CREATE TABLE chantiers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nom                 VARCHAR(255) NOT NULL,
    status              VARCHAR(50) DEFAULT 'actif',
    -- actif | en_pause | cloture | archive
    client_nom          VARCHAR(255),
    client_email        VARCHAR(255),
    client_telephone    VARCHAR(20),
    localisation        VARCHAR(255),
    adresse_complete    TEXT,
    latitude            DECIMAL(10, 8),
    longitude           DECIMAL(11, 8),
    budget_previsionnel DECIMAL(12,2),
    date_debut          DATE,
    date_fin_prevue     DATE,
    date_cloture        DATE,
    description         TEXT,
    chef_chantier_id    UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── CATALOGUE MATÉRIAUX ─────────────────────────────────────
CREATE TABLE catalog (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code_interne     VARCHAR(100),
    code_fournisseur VARCHAR(100),
    nom              VARCHAR(255) NOT NULL,
    nom_aliases      TEXT[],  -- ["IPN", "profilé en I", "HEA"] for fuzzy match
    description      TEXT,
    unite            VARCHAR(20) DEFAULT 'pcs',
    -- pcs | m | m2 | m3 | kg | L | rouleau | barre | boite
    quantite_depot   INT DEFAULT 0,
    seuil_alerte     INT DEFAULT 5,
    prix_achat_ht    DECIMAL(10,2),
    prix_vente_ht    DECIMAL(10,2),
    famille          VARCHAR(100),
    -- tuyauterie | metallerie | fixation | electrique | soudure | peinture | epi | autre
    fournisseur_nom  VARCHAR(255),
    qr_code_value    VARCHAR(255),
    -- embedding     vector(1536),  -- Uncomment after enabling pgvector
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, code_interne)
);

CREATE INDEX idx_catalog_nom_trgm ON catalog USING gin (nom gin_trgm_ops);
CREATE INDEX idx_catalog_aliases ON catalog USING gin (nom_aliases);

-- ─── MOUVEMENTS DE STOCK ─────────────────────────────────────
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    catalog_id      UUID NOT NULL REFERENCES catalog(id),
    chantier_id     UUID REFERENCES chantiers(id),
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(10) NOT NULL CHECK (action IN ('IN', 'OUT')),
    quantite        INT NOT NULL CHECK (quantite > 0),
    quantite_avant  INT,
    quantite_apres  INT,
    notes           TEXT,
    source          VARCHAR(50) DEFAULT 'manual',
    -- manual | voice | ocr | auto | correction
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_chantier ON stock_movements(chantier_id);
CREATE INDEX idx_stock_movements_catalog ON stock_movements(catalog_id);
CREATE INDEX idx_stock_movements_tenant_date ON stock_movements(tenant_id, created_at DESC);

-- ─── DÉPENSES / TICKETS ──────────────────────────────────────
CREATE TABLE expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chantier_id     UUID REFERENCES chantiers(id),
    user_id         UUID REFERENCES users(id),
    montant_ttc     DECIMAL(10,2) NOT NULL,
    montant_ht      DECIMAL(10,2),
    taux_tva        DECIMAL(5,2) DEFAULT 20.00,
    category        VARCHAR(50) NOT NULL
        CHECK (category IN ('carburant','materiau','repas','peage','autre')),
    fournisseur     VARCHAR(255) NOT NULL,
    date_depense    DATE DEFAULT CURRENT_DATE,
    statut          VARCHAR(50) DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente','valide','refuse','paye')),
    ticket_image_url TEXT,
    notes           TEXT,
    source          VARCHAR(50) DEFAULT 'manual',
    validated_by    UUID REFERENCES users(id),
    validated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_chantier ON expenses(chantier_id);
CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_expenses_tenant_date ON expenses(tenant_id, date_depense DESC);
CREATE INDEX idx_expenses_statut ON expenses(tenant_id, statut);

-- ─── DEVIS ──────────────────────────────────────────────────
CREATE TABLE quotes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chantier_id         UUID REFERENCES chantiers(id),
    numero_devis        VARCHAR(50),
    client_nom          VARCHAR(255),
    client_email        VARCHAR(255),
    client_telephone    VARCHAR(20),
    statut              VARCHAR(50) DEFAULT 'brouillon'
        CHECK (statut IN ('brouillon','envoye','accepte','refuse','commande','archive')),
    total_ht            DECIMAL(12,2),
    total_tva           DECIMAL(12,2),
    total_ttc           DECIMAL(12,2),
    taux_marge          DECIMAL(5,2) DEFAULT 20.00,
    html_content        TEXT,
    raw_transcription   TEXT,
    pdf_url             TEXT,
    date_emission       DATE DEFAULT CURRENT_DATE,
    date_validite       DATE DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    notes               TEXT,
    source              VARCHAR(50) DEFAULT 'manual',
    -- manual | voice | ai
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quotes_chantier ON quotes(chantier_id);
CREATE INDEX idx_quotes_tenant_statut ON quotes(tenant_id, statut);

-- ─── LIGNES DE DEVIS ─────────────────────────────────────────
CREATE TABLE quote_lines (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id         UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    catalog_id       UUID REFERENCES catalog(id),
    designation      VARCHAR(255) NOT NULL,
    description      TEXT,
    quantite         DECIMAL(10,2) NOT NULL,
    unite            VARCHAR(20) DEFAULT 'pcs',
    prix_unitaire_ht DECIMAL(10,2) NOT NULL,
    taux_tva         DECIMAL(5,2) DEFAULT 20.00,
    remise           DECIMAL(5,2) DEFAULT 0,
    total_ht         DECIMAL(12,2) GENERATED ALWAYS AS
                     (ROUND(quantite * prix_unitaire_ht * (1 - remise/100), 2)) STORED,
    ordre            INT DEFAULT 0
);

-- ─── POSTS SEO ───────────────────────────────────────────────
CREATE TABLE seo_posts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chantier_id      UUID REFERENCES chantiers(id),
    titre            VARCHAR(255),
    markdown_content TEXT,
    html_content     TEXT,
    statut           VARCHAR(50) DEFAULT 'brouillon'
        CHECK (statut IN ('brouillon','publie','archive')),
    mots_cles        TEXT[],
    published_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SESSIONS AGENT (mémoire contexte court-terme) ───────────
CREATE TABLE agent_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id          UUID REFERENCES users(id),
    session_key      VARCHAR(255) UNIQUE NOT NULL,
    last_chantier_id UUID REFERENCES chantiers(id),
    context          JSONB DEFAULT '{}',
    -- { pendingDisambiguation?: {...}, recentEntities?: {...} }
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_sessions_key ON agent_sessions(session_key);

-- ─── JOURNAL DES ACTIONS AGENT ───────────────────────────────
CREATE TABLE agent_actions_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID REFERENCES tenants(id),
    user_id          UUID REFERENCES users(id),
    session_key      VARCHAR(255),
    user_message     TEXT,
    ai_response      TEXT,
    tools_called     JSONB DEFAULT '[]',
    actions_executed JSONB DEFAULT '[]',
    model_used       VARCHAR(100),
    duration_ms      INT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_log_tenant ON agent_actions_log(tenant_id, created_at DESC);
CREATE INDEX idx_agent_log_session ON agent_actions_log(session_key);

-- ─── TRIGGERS updated_at ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_chantiers_ua    BEFORE UPDATE ON chantiers       FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_quotes_ua       BEFORE UPDATE ON quotes          FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_sessions_ua     BEFORE UPDATE ON agent_sessions  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
