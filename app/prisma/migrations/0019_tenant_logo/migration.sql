-- Business logo kept in the database (no object storage needed). PNG or JPEG only, size capped in the API.
CREATE TABLE tenant_logos(
  tenant_id BIGINT PRIMARY KEY REFERENCES tenants(id), mime TEXT NOT NULL CHECK(mime IN ('image/png','image/jpeg')), data BYTEA NOT NULL, updated_at TEXT NOT NULL);
ALTER TABLE tenant_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_logos USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_logos TO marquee_app; END IF;
END $$;
