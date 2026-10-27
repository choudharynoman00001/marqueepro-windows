-- Named stock locations (store room, kitchen, hall store). Movements may carry a location; a movement without one counts as "Unassigned".
-- Transfers are two rows of kind 'transfer' (minus at the source, plus at the destination) so total stock on hand does not change.
CREATE TABLE stock_locations(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL,
  active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX stock_locations_name ON stock_locations(tenant_id, lower(name));
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stock_locations USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
ALTER TABLE stock_movements ADD COLUMN location_id BIGINT REFERENCES stock_locations(id);
CREATE INDEX stock_movements_location ON stock_movements(tenant_id, item_id, location_id);
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK(kind IN ('purchase','issue','return','damage','adjust','usage','writeoff','transfer'));
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, UPDATE ON stock_locations TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
