-- A fenced receive request id can never be applied later. Used to drop a pending receive safely: after fencing, a delayed original request is refused.
CREATE TABLE purchase_receipt_fences(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), po_id BIGINT NOT NULL REFERENCES purchase_orders(id),
  request_id TEXT NOT NULL, created_by BIGINT, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX por_fence ON purchase_receipt_fences(tenant_id, po_id, request_id);
CREATE TRIGGER tg_porf_ro BEFORE UPDATE OR DELETE ON purchase_receipt_fences FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
ALTER TABLE purchase_receipt_fences ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_receipt_fences USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT ON purchase_receipt_fences TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
