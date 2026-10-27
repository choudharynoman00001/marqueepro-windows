-- Optional per-business integrations. Off until the business enters its own account details. Secrets are stored encrypted by the API (AES-256-GCM) and never returned.
CREATE TABLE tenant_integrations(
  tenant_id BIGINT NOT NULL REFERENCES tenants(id), key TEXT NOT NULL CHECK(key IN ('email','whatsapp_api')),
  config TEXT NOT NULL DEFAULT '{}', secret_enc TEXT,
  status TEXT NOT NULL DEFAULT 'configured' CHECK(status IN ('configured','verified','failed')),
  verified_at TEXT, last_error TEXT, updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id, key));
-- Append-only record of what the system handed to a provider. "sent_to_provider" is not "delivered".
CREATE TABLE message_log(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), channel TEXT NOT NULL CHECK(channel IN ('email','whatsapp_api')),
  customer_id BIGINT, booking_id BIGINT, recipient TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('sent_to_provider','failed','blocked')),
  provider_ref TEXT, error TEXT, created_by BIGINT, created_at TEXT NOT NULL);
CREATE INDEX ix_message_log ON message_log(tenant_id, created_at);
CREATE OR REPLACE FUNCTION message_log_readonly() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'message_log is append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER message_log_ro BEFORE UPDATE OR DELETE ON message_log FOR EACH ROW EXECUTE FUNCTION message_log_readonly();
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY; ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_integrations USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON message_log USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_integrations TO marquee_app; GRANT SELECT, INSERT ON message_log TO marquee_app; GRANT USAGE, SELECT ON SEQUENCE message_log_id_seq TO marquee_app;
  END IF;
END $$;
