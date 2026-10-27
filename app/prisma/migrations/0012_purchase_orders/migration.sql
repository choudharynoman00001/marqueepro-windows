-- Purchase orders to vendors with receipt into stock. A receipt writes a normal 'purchase' stock movement; nothing here creates a vendor bill or payment.
CREATE TABLE purchase_orders(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')), created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE purchase_order_lines(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), po_id BIGINT NOT NULL REFERENCES purchase_orders(id),
  item_id BIGINT NOT NULL REFERENCES inventory_items(id), qty_milli BIGINT NOT NULL CHECK(qty_milli > 0), unit_cost_minor BIGINT NOT NULL CHECK(unit_cost_minor >= 0));
CREATE TABLE purchase_receipts(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), po_line_id BIGINT NOT NULL REFERENCES purchase_order_lines(id),
  qty_milli BIGINT NOT NULL CHECK(qty_milli > 0), movement_id BIGINT NOT NULL REFERENCES stock_movements(id), created_by BIGINT, created_at TEXT NOT NULL);
CREATE INDEX po_vendor ON purchase_orders(tenant_id, vendor_id);
CREATE INDEX pol_po ON purchase_order_lines(tenant_id, po_id);
CREATE INDEX por_line ON purchase_receipts(tenant_id, po_line_id);
CREATE TRIGGER tg_por_ro BEFORE UPDATE OR DELETE ON purchase_receipts FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_orders','purchase_order_lines','purchase_receipts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant())', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO marquee_app', t);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app; END IF;
END $$;
