-- Structured dietary requirements per booking: a fixed category list, a guest count and an optional note. Rows are removed, not edited.
CREATE TABLE booking_dietary(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), booking_id BIGINT NOT NULL REFERENCES bookings(id),
  category TEXT NOT NULL CHECK(category IN ('vegetarian','vegan','halal_only','gluten_free','nut_allergy','diabetic','jain','child_meal','other')),
  guests BIGINT NOT NULL CHECK(guests > 0), note TEXT NOT NULL DEFAULT '', created_by BIGINT, created_at TEXT NOT NULL);
CREATE INDEX booking_dietary_b ON booking_dietary(tenant_id, booking_id);
ALTER TABLE booking_dietary ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON booking_dietary USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant());
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, DELETE ON booking_dietary TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
