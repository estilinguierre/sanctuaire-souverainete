-- ============================================================
-- FORGE FIELD — Row Level Security Policies
-- Migration: 002_rls_policies.sql
-- ============================================================
-- All tables are isolated by tenant_id.
-- The service role key bypasses RLS (used by the API server-side).
-- The anon/user key enforces RLS (used from the browser/mobile).

ALTER TABLE tenants           ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantiers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog           ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements   ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions_log ENABLE ROW LEVEL SECURITY;

-- Helper: current user's tenant_id from JWT custom claim
CREATE OR REPLACE FUNCTION auth_tenant_id() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID;
$$;

-- Chantiers: tenant isolation
CREATE POLICY tenant_isolation ON chantiers
  USING (tenant_id = auth_tenant_id());

-- Catalog: tenant isolation
CREATE POLICY tenant_isolation ON catalog
  USING (tenant_id = auth_tenant_id());

-- Stock movements: tenant isolation
CREATE POLICY tenant_isolation ON stock_movements
  USING (tenant_id = auth_tenant_id());

-- Expenses: employes see own, chefs see team, comptable sees all
CREATE POLICY expenses_employe ON expenses
  FOR SELECT USING (
    tenant_id = auth_tenant_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
          AND u.tenant_id = auth_tenant_id()
          AND u.role IN ('chef_chantier','comptable','admin')
      )
    )
  );

CREATE POLICY expenses_insert ON expenses
  FOR INSERT WITH CHECK (
    tenant_id = auth_tenant_id()
    AND user_id = auth.uid()
  );

-- Quotes: tenant isolation
CREATE POLICY tenant_isolation ON quotes
  USING (tenant_id = auth_tenant_id());

-- SEO posts: tenant isolation
CREATE POLICY tenant_isolation ON seo_posts
  USING (tenant_id = auth_tenant_id());

-- Agent sessions: user-scoped
CREATE POLICY user_sessions ON agent_sessions
  USING (
    tenant_id = auth_tenant_id()
    AND user_id = auth.uid()
  );

-- Agent log: tenant isolation
CREATE POLICY tenant_isolation ON agent_actions_log
  USING (tenant_id = auth_tenant_id());
