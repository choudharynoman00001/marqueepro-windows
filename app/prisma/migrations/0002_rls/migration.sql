-- Row-level security: second layer under the application's tenant checks.
-- The API sets app.tenant_id (or app.system='on' for login/session lookup and the platform super admin) at the start of each transaction.
CREATE OR REPLACE FUNCTION app_tenant() RETURNS bigint AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::bigint $$ LANGUAGE sql STABLE;
CREATE OR REPLACE FUNCTION app_system() RETURNS boolean AS $$ SELECT COALESCE(current_setting('app.system', true), '') = 'on' $$ LANGUAGE sql STABLE;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['branches','venues','venue_blocks','customers','customer_notes','bookings','booking_status_history','booking_services','packages','service_catalog','invoices','invoice_items',
    'payments','payment_allocations','payment_adjustments','credit_notes','expense_categories','vendors','expenses','vendor_bills','vendor_payments','employees','attendance','payroll_entries',
    'event_tasks','inventory_items','stock_movements','menu_items','recipe_ingredients','booking_menu','food_records','notification_outbox','support_tickets','counters'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant())', t);
  END LOOP;
END $$;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenants USING (app_system() OR id = app_tenant()) WITH CHECK (app_system() OR id = app_tenant());
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_only ON sessions USING (app_system()) WITH CHECK (app_system());

-- the application role (created by scripts/ensure-role) gets plain DML, never ownership, so RLS always applies to it
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT USAGE ON SCHEMA public TO marquee_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
