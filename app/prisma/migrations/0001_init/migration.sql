CREATE TABLE plans(
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  max_branches BIGINT, max_users BIGINT, max_venues BIGINT,
  price_minor BIGINT, notes TEXT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE tenants(
  id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'trial' CHECK(status IN ('trial','active','past_due','suspended','cancelled')),
  plan_id BIGINT REFERENCES plans(id), period_end TEXT,
  address TEXT, phone TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Karachi', currency TEXT NOT NULL DEFAULT 'PKR',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV', tax_label TEXT NOT NULL DEFAULT 'Tax', default_tax_bp BIGINT NOT NULL DEFAULT 0,
  terms TEXT, created_at TEXT NOT NULL);
CREATE TABLE users(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT REFERENCES tenants(id),
  username TEXT NOT NULL, name TEXT NOT NULL, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('super','owner','manager','accountant','booking','store','event_staff')),
  branch_id BIGINT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  must_change_password BIGINT NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE sessions(
  token_hash TEXT PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL);
CREATE TABLE counters(tenant_id BIGINT NOT NULL, kind TEXT NOT NULL, next BIGINT NOT NULL, PRIMARY KEY(tenant_id,kind));
CREATE TABLE branches(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, address TEXT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE venues(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), branch_id BIGINT NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL, venue_type TEXT NOT NULL DEFAULT 'hall', capacity BIGINT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE venue_blocks(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, venue_id BIGINT NOT NULL REFERENCES venues(id),
  starts_at TIMESTAMP NOT NULL, ends_at TIMESTAMP NOT NULL, reason TEXT, created_by BIGINT, created_at TEXT NOT NULL, CHECK(ends_at > starts_at));
CREATE TABLE customers(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, phone TEXT NOT NULL,
  phone2 TEXT, email TEXT, address TEXT, cnic TEXT, notes TEXT,
  whatsapp_consent BIGINT NOT NULL DEFAULT 0, whatsapp_consent_at TEXT, marketing_consent BIGINT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_cust ON customers(tenant_id, phone);
CREATE TABLE customer_notes(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, customer_id BIGINT NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL CHECK(kind IN ('note','followup','feedback','complaint')), body TEXT NOT NULL,
  due_date TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE bookings(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), code TEXT NOT NULL,
  branch_id BIGINT NOT NULL REFERENCES branches(id), customer_id BIGINT NOT NULL REFERENCES customers(id),
  venue_id BIGINT NOT NULL REFERENCES venues(id),
  status TEXT NOT NULL DEFAULT 'inquiry' CHECK(status IN ('inquiry','tentative','confirmed','completed','cancelled')),
  event_type TEXT NOT NULL, event_date TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
  setup_min BIGINT NOT NULL DEFAULT 0, cleanup_min BIGINT NOT NULL DEFAULT 0, block_start TIMESTAMP NOT NULL, block_end TIMESTAMP NOT NULL,
  guests BIGINT NOT NULL DEFAULT 0, per_head_minor BIGINT NOT NULL DEFAULT 0, rent_minor BIGINT NOT NULL DEFAULT 0,
  package_id BIGINT, requirements TEXT, checklist TEXT, cancel_reason TEXT, actual_guests BIGINT,
  created_by BIGINT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(tenant_id, code), CHECK(ends_at > starts_at), CHECK(guests >= 0));
CREATE INDEX IF NOT EXISTS ix_book_venue ON bookings(tenant_id, venue_id, block_start);
CREATE INDEX IF NOT EXISTS ix_book_date ON bookings(tenant_id, event_date);
CREATE TABLE booking_status_history(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT NOT NULL REFERENCES bookings(id),
  old_status TEXT, new_status TEXT NOT NULL, note TEXT, changed_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE booking_services(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT NOT NULL REFERENCES bookings(id),
  description TEXT NOT NULL, qty_milli BIGINT NOT NULL DEFAULT 1000, unit_minor BIGINT NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE packages(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, per_head_minor BIGINT NOT NULL DEFAULT 0,
  description TEXT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE service_catalog(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, category TEXT, default_price_minor BIGINT NOT NULL DEFAULT 0,
  active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE invoices(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), booking_id BIGINT NOT NULL REFERENCES bookings(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id), kind TEXT NOT NULL CHECK(kind IN ('quote','invoice')),
  number TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','void')),
  issue_date TEXT, subtotal_minor BIGINT NOT NULL DEFAULT 0, discount_minor BIGINT NOT NULL DEFAULT 0,
  discount_by BIGINT, tax_bp BIGINT NOT NULL DEFAULT 0, tax_minor BIGINT NOT NULL DEFAULT 0, total_minor BIGINT NOT NULL DEFAULT 0,
  notes TEXT, terms TEXT, void_reason TEXT, created_by BIGINT, created_at TEXT NOT NULL,
  UNIQUE(tenant_id, number), CHECK(discount_minor >= 0));
CREATE TABLE invoice_items(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL, qty_milli BIGINT NOT NULL, unit_minor BIGINT NOT NULL, line_minor BIGINT NOT NULL, position BIGINT NOT NULL DEFAULT 0);
CREATE TABLE payments(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL REFERENCES tenants(id), booking_id BIGINT NOT NULL REFERENCES bookings(id),
  customer_id BIGINT NOT NULL REFERENCES customers(id), receipt_no TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
  method TEXT NOT NULL CHECK(method IN ('cash','bank','card','digital','cheque')), reference TEXT, note TEXT,
  received_on TEXT NOT NULL, idempotency_key TEXT, created_by BIGINT, created_at TEXT NOT NULL,
  UNIQUE(tenant_id, receipt_no), UNIQUE(tenant_id, idempotency_key));
CREATE TABLE payment_allocations(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, payment_id BIGINT NOT NULL REFERENCES payments(id),
  invoice_id BIGINT NOT NULL REFERENCES invoices(id), amount_minor BIGINT NOT NULL CHECK(amount_minor <> 0), created_at TEXT NOT NULL);
CREATE TABLE payment_adjustments(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, payment_id BIGINT NOT NULL REFERENCES payments(id),
  kind TEXT NOT NULL CHECK(kind IN ('refund','reversal')), amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
  method TEXT, reference TEXT, reason TEXT NOT NULL, adjusted_on TEXT NOT NULL, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE credit_notes(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, invoice_id BIGINT NOT NULL REFERENCES invoices(id),
  number TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor > 0), reason TEXT NOT NULL, created_by BIGINT, created_at TEXT NOT NULL,
  UNIQUE(tenant_id, number));
CREATE TABLE expense_categories(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, UNIQUE(tenant_id, name));
CREATE TABLE vendors(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, phone TEXT, vendor_type TEXT, notes TEXT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE expenses(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, branch_id BIGINT NOT NULL, category_id BIGINT NOT NULL REFERENCES expense_categories(id),
  booking_id BIGINT REFERENCES bookings(id), amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank','card','digital','cheque')),
  spent_on TEXT NOT NULL, note TEXT, voided BIGINT NOT NULL DEFAULT 0, void_reason TEXT, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE vendor_bills(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, vendor_id BIGINT NOT NULL REFERENCES vendors(id), branch_id BIGINT NOT NULL,
  booking_id BIGINT REFERENCES bookings(id), category_id BIGINT REFERENCES expense_categories(id),
  kind TEXT NOT NULL DEFAULT 'bill' CHECK(kind IN ('quotation','order','bill','advance')),
  total_minor BIGINT NOT NULL CHECK(total_minor >= 0), billed_on TEXT NOT NULL, due_on TEXT, note TEXT, voided BIGINT NOT NULL DEFAULT 0, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE vendor_payments(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, vendor_id BIGINT NOT NULL REFERENCES vendors(id),
  vendor_bill_id BIGINT REFERENCES vendor_bills(id), amount_minor BIGINT NOT NULL CHECK(amount_minor > 0),
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank','card','digital','cheque')),
  paid_on TEXT NOT NULL, is_advance BIGINT NOT NULL DEFAULT 0, reference TEXT, note TEXT, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE employees(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, branch_id BIGINT NOT NULL, name TEXT NOT NULL, job_title TEXT, phone TEXT,
  pay_type TEXT NOT NULL DEFAULT 'monthly' CHECK(pay_type IN ('monthly','daily')), pay_minor BIGINT NOT NULL DEFAULT 0,
  overtime_rate_minor BIGINT NOT NULL DEFAULT 0, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE attendance(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, employee_id BIGINT NOT NULL REFERENCES employees(id), day TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','absent','leave','half')), overtime_min BIGINT NOT NULL DEFAULT 0,
  UNIQUE(employee_id, day));
CREATE TABLE payroll_entries(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, employee_id BIGINT NOT NULL REFERENCES employees(id), period TEXT NOT NULL,
  base_minor BIGINT NOT NULL, overtime_minor BIGINT NOT NULL DEFAULT 0, deduction_minor BIGINT NOT NULL DEFAULT 0, net_minor BIGINT NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash', paid_on TEXT NOT NULL, note TEXT, created_by BIGINT, created_at TEXT NOT NULL,
  UNIQUE(employee_id, period));
CREATE TABLE event_tasks(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT NOT NULL REFERENCES bookings(id), title TEXT NOT NULL,
  employee_id BIGINT REFERENCES employees(id), role TEXT, due_at TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done')), created_at TEXT NOT NULL);
CREATE TABLE inventory_items(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, category TEXT, unit TEXT NOT NULL DEFAULT 'pcs',
  min_stock_milli BIGINT NOT NULL DEFAULT 0, unit_cost_minor BIGINT NOT NULL DEFAULT 0, consumable BIGINT NOT NULL DEFAULT 0,
  supplier TEXT, active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE stock_movements(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, item_id BIGINT NOT NULL REFERENCES inventory_items(id),
  booking_id BIGINT REFERENCES bookings(id), kind TEXT NOT NULL CHECK(kind IN ('purchase','issue','return','damage','adjust','usage')),
  qty_milli BIGINT NOT NULL, unit_cost_minor BIGINT, note TEXT, created_by BIGINT, created_at TEXT NOT NULL);
CREATE TABLE menu_items(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'plate', price_minor BIGINT NOT NULL DEFAULT 0,
  active BIGINT NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE recipe_ingredients(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, menu_item_id BIGINT NOT NULL REFERENCES menu_items(id),
  inventory_item_id BIGINT NOT NULL REFERENCES inventory_items(id), qty_per_head_milli BIGINT NOT NULL CHECK(qty_per_head_milli > 0));
CREATE TABLE booking_menu(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT NOT NULL REFERENCES bookings(id),
  menu_item_id BIGINT NOT NULL REFERENCES menu_items(id), note TEXT, UNIQUE(booking_id, menu_item_id));
CREATE TABLE food_records(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT NOT NULL REFERENCES bookings(id),
  kind TEXT NOT NULL CHECK(kind IN ('cost','wastage','leftover')), description TEXT NOT NULL, amount_minor BIGINT NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE notification_outbox(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, booking_id BIGINT, customer_id BIGINT NOT NULL, template TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp_link', body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','opened','blocked_no_consent')),
  created_by BIGINT, created_at TEXT NOT NULL, opened_at TEXT);
CREATE TABLE support_tickets(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT NOT NULL, subject TEXT NOT NULL, body TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
  created_by BIGINT, created_at TEXT NOT NULL, reply TEXT);
CREATE TABLE audit_logs(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT, actor_user_id BIGINT, action TEXT NOT NULL, entity_type TEXT, entity_id BIGINT, detail TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_audit ON audit_logs(tenant_id, id);


CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE UNIQUE INDEX ux_users_username ON users (lower(username));
CREATE INDEX ix_sessions_user ON sessions(user_id);

-- Double booking is blocked by the database itself (exclusion constraint), not only by app checks.
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (venue_id WITH =, tsrange(block_start, block_end) WITH &&)
  WHERE (status IN ('tentative','confirmed','completed'));
ALTER TABLE venue_blocks ADD CONSTRAINT venue_blocks_no_overlap
  EXCLUDE USING gist (venue_id WITH =, tsrange(starts_at, ends_at) WITH &&);

-- bookings vs maintenance blocks (cross-table), serialised per venue
CREATE OR REPLACE FUNCTION chk_booking_vs_block() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.venue_id);
  IF NEW.status IN ('tentative','confirmed','completed') AND EXISTS (
    SELECT 1 FROM venue_blocks v WHERE v.venue_id = NEW.venue_id AND tsrange(v.starts_at, v.ends_at) && tsrange(NEW.block_start, NEW.block_end)) THEN
    RAISE EXCEPTION 'OVERLAP' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_booking_vs_block BEFORE INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION chk_booking_vs_block();

CREATE OR REPLACE FUNCTION chk_block_vs_booking() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.venue_id);
  IF EXISTS (SELECT 1 FROM bookings b WHERE b.venue_id = NEW.venue_id AND b.status IN ('tentative','confirmed','completed')
    AND tsrange(b.block_start, b.block_end) && tsrange(NEW.starts_at, NEW.ends_at)) THEN
    RAISE EXCEPTION 'OVERLAP' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_block_vs_booking BEFORE INSERT OR UPDATE ON venue_blocks FOR EACH ROW EXECUTE FUNCTION chk_block_vs_booking();

-- append-only tables
CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY: % on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'P0001'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_payments_ro BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_padj_ro BEFORE UPDATE OR DELETE ON payment_adjustments FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_alloc_ro BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_cn_ro BEFORE UPDATE OR DELETE ON credit_notes FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_audit_ro BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_stock_ro BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
CREATE TRIGGER tg_expense_del BEFORE DELETE ON expenses FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE OR REPLACE FUNCTION expense_amount_frozen() RETURNS trigger AS $$
BEGIN IF NEW.amount_minor <> OLD.amount_minor OR NEW.spent_on <> OLD.spent_on THEN RAISE EXCEPTION 'APPEND_ONLY: expense amount/date cannot change; void and re-enter'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_expense_upd BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION expense_amount_frozen();

-- issued invoices cannot change; draft items only
CREATE OR REPLACE FUNCTION invoice_frozen() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'INVOICE_FROZEN'; END IF; RETURN OLD;
  END IF;
  IF OLD.status = 'void' THEN RAISE EXCEPTION 'INVOICE_FROZEN'; END IF;
  IF OLD.status = 'issued' AND (NEW.subtotal_minor <> OLD.subtotal_minor OR NEW.total_minor <> OLD.total_minor OR NEW.discount_minor <> OLD.discount_minor
     OR NEW.tax_minor <> OLD.tax_minor OR NEW.number IS DISTINCT FROM OLD.number OR NEW.customer_id <> OLD.customer_id OR NEW.booking_id <> OLD.booking_id OR NEW.kind <> OLD.kind
     OR NEW.status NOT IN ('issued','void')) THEN RAISE EXCEPTION 'INVOICE_FROZEN'; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_invoice_frozen BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION invoice_frozen();

CREATE OR REPLACE FUNCTION invoice_item_frozen() RETURNS trigger AS $$
DECLARE st text; iid bigint;
BEGIN
  iid := CASE WHEN TG_OP = 'INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
  SELECT status INTO st FROM invoices WHERE id = iid;
  IF st IS NOT NULL AND st <> 'draft' THEN RAISE EXCEPTION 'INVOICE_FROZEN'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER tg_invoice_item_frozen BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION invoice_item_frozen();

-- cross-tenant reference guard: child rows must point to a parent in the same tenant
CREATE OR REPLACE FUNCTION same_tenant_refs() RETURNS trigger AS $$
DECLARE r record; ok boolean;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('customer_id','customers'),('venue_id','venues'),('branch_id','branches'),('booking_id','bookings'),('invoice_id','invoices'),('payment_id','payments'),
    ('vendor_id','vendors'),('employee_id','employees'),('item_id','inventory_items'),('menu_item_id','menu_items'),('category_id','expense_categories')) AS t(col,tbl) LOOP
    CONTINUE WHEN to_jsonb(NEW) -> r.col IS NULL OR (to_jsonb(NEW) ->> r.col) IS NULL;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I WHERE id = $1 AND tenant_id = $2)', r.tbl) INTO ok USING (to_jsonb(NEW) ->> r.col)::bigint, NEW.tenant_id;
    IF NOT ok THEN RAISE EXCEPTION 'CROSS_TENANT reference % -> %', r.col, r.tbl USING ERRCODE = '23503'; END IF;
  END LOOP;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['venues','venue_blocks','customer_notes','bookings','booking_status_history','booking_services','invoices','invoice_items','payments','payment_allocations',
    'payment_adjustments','credit_notes','expenses','vendor_bills','vendor_payments','employees','attendance','payroll_entries','event_tasks','stock_movements','recipe_ingredients',
    'booking_menu','food_records','notification_outbox'] LOOP
    EXECUTE format('CREATE TRIGGER tg_same_tenant BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION same_tenant_refs()', t);
  END LOOP;
END $$;
