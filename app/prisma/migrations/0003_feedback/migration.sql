-- Customer feedback after an event: one rating (1-5) and an optional comment per booking.
CREATE TABLE feedback(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), booking_id BIGINT NOT NULL REFERENCES bookings(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT,
  created_by BIGINT, created_at TEXT NOT NULL, UNIQUE(tenant_id, booking_id));
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON feedback USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON feedback TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
