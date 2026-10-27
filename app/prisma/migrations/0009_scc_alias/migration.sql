-- SCC v1.1 candidate: external_ref is an opaque alias assigned by the Control Center, bound once to a business.
ALTER TABLE tenants ADD COLUMN scc_ref TEXT;
ALTER TABLE tenants ADD COLUMN scc_valid_until TEXT;
ALTER TABLE tenants ADD COLUMN scc_grace_until TEXT;
CREATE UNIQUE INDEX tenants_scc_ref ON tenants(scc_ref) WHERE scc_ref IS NOT NULL;
CREATE TABLE scc_meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN
    GRANT SELECT, INSERT ON scc_meta TO marquee_app;
  END IF;
END $$;
