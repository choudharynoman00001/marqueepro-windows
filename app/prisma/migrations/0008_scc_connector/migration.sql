-- Subscription Control Center connector (contract scc-1, DRAFT). Platform level tables, no tenant data inside.
ALTER TABLE tenants ADD COLUMN access_blocked BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN scc_prev_status TEXT;
ALTER TABLE tenants ADD COLUMN scc_changed_at TEXT;
CREATE TABLE scc_nonces(key_id TEXT NOT NULL, nonce TEXT NOT NULL, seen_at BIGINT NOT NULL, PRIMARY KEY(key_id, nonce));
CREATE TABLE scc_requests(
  request_id TEXT PRIMARY KEY, action TEXT NOT NULL, external_ref TEXT NOT NULL, payload_hash TEXT NOT NULL,
  response TEXT NOT NULL, created_at TEXT NOT NULL);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT, DELETE ON scc_nonces TO marquee_app;
    GRANT SELECT, INSERT, DELETE ON scc_requests TO marquee_app;
  END IF;
END $$;
