-- Planned instalments for a booking. Amounts and dates are typed in by the business; nothing is prefilled.
-- Rows are never deleted: a planned instalment is cancelled, so the history stays.
CREATE TABLE payment_schedule(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), booking_id BIGINT NOT NULL REFERENCES bookings(id),
  due_on TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor > 0), label TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','cancelled')), created_by BIGINT, created_at TEXT NOT NULL);
CREATE INDEX payment_schedule_booking ON payment_schedule(tenant_id, booking_id);
ALTER TABLE payment_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_schedule USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, UPDATE ON payment_schedule TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
