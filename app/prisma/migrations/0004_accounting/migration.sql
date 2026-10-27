-- Contract terms are written by the business owner. Nothing is pre-filled.
ALTER TABLE tenants ADD COLUMN contract_terms TEXT;
-- Opening balances for the cash book (entered by the business; default 0).
ALTER TABLE tenants ADD COLUMN opening_cash_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN opening_bank_minor BIGINT NOT NULL DEFAULT 0;
-- Append-only: a closing is never edited; a later closing for the same day supersedes it in reports.
CREATE TABLE cash_closings(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), day TEXT NOT NULL,
  expected_minor BIGINT NOT NULL, counted_minor BIGINT NOT NULL CHECK(counted_minor >= 0), difference_minor BIGINT NOT NULL,
  note TEXT, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE bank_reconciliations(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), as_of TEXT NOT NULL,
  book_minor BIGINT NOT NULL, statement_minor BIGINT NOT NULL, difference_minor BIGINT NOT NULL,
  note TEXT, created_by BIGINT, created_at TEXT NOT NULL);
-- Platform-level coupon configuration. No amounts are pre-filled and nothing is charged by this table.
CREATE TABLE coupons(
  id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, percent_bp BIGINT CHECK(percent_bp BETWEEN 0 AND 10000),
  amount_minor BIGINT CHECK(amount_minor >= 0), valid_until TEXT, active BIGINT NOT NULL DEFAULT 1, note TEXT, created_at TEXT NOT NULL);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['cash_closings','bank_reconciliations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (app_system() OR tenant_id = app_tenant()) WITH CHECK (app_system() OR tenant_id = app_tenant())', t);
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON cash_closings, bank_reconciliations, coupons TO marquee_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app;
  END IF;
END $$;
