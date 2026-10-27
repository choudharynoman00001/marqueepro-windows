-- Vendor contract records: only what the owner types (title, their own reference, dates, status, free-text notes). The system invents and computes no fee, penalty, tax or clause.
CREATE TABLE vendor_contracts(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  title TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '', starts_on TEXT, ends_on TEXT, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','ended','cancelled')), created_by BIGINT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX vc_vendor ON vendor_contracts(tenant_id, vendor_id);
ALTER TABLE vendor_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON vendor_contracts USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN GRANT SELECT, INSERT, UPDATE ON vendor_contracts TO marquee_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app; END IF;
END $$;
