-- Optional JazzCash adapter (the business's own merchant account): payment requests and signed provider results. Both tables are append-only.
ALTER TABLE tenant_integrations DROP CONSTRAINT tenant_integrations_key_check;
ALTER TABLE tenant_integrations ADD CONSTRAINT tenant_integrations_key_check CHECK(key IN ('email','whatsapp_api','ai_assistant','jazzcash'));
CREATE TABLE online_payment_requests(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), provider TEXT NOT NULL CHECK(provider IN ('jazzcash')),
  booking_id BIGINT NOT NULL REFERENCES bookings(id), customer_id BIGINT NOT NULL REFERENCES customers(id), reference TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK(amount_minor > 0), created_by BIGINT, created_at TEXT NOT NULL, UNIQUE(tenant_id, provider, reference));
CREATE TABLE online_payment_events(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), provider TEXT NOT NULL CHECK(provider IN ('jazzcash')),
  request_id BIGINT REFERENCES online_payment_requests(id), event_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('recorded','failed','amount_mismatch','unknown_reference','wrong_merchant','not_recorded')),
  amount_minor BIGINT, response_code TEXT, provider_ref TEXT, body_sha256 TEXT NOT NULL, payment_id BIGINT REFERENCES payments(id), created_at TEXT NOT NULL,
  UNIQUE(tenant_id, provider, event_key));
CREATE OR REPLACE FUNCTION onlinepay_readonly() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'online payment records are append-only'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER online_payment_requests_ro BEFORE UPDATE OR DELETE ON online_payment_requests FOR EACH ROW EXECUTE FUNCTION onlinepay_readonly();
CREATE TRIGGER online_payment_events_ro BEFORE UPDATE OR DELETE ON online_payment_events FOR EACH ROW EXECUTE FUNCTION onlinepay_readonly();
ALTER TABLE online_payment_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE online_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON online_payment_requests USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
CREATE POLICY tenant_isolation ON online_payment_events USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT ON online_payment_requests, online_payment_events TO marquee_app;
    GRANT USAGE, SELECT ON SEQUENCE online_payment_requests_id_seq, online_payment_events_id_seq TO marquee_app;
  END IF;
END $$;
