-- One-time password reset links. Only a hash of the token is stored. A link expires and works once. No email is sent by the system; an owner or platform admin hands the link over.
CREATE TABLE password_resets(
  id BIGSERIAL PRIMARY KEY, tenant_id BIGINT REFERENCES tenants(id), user_id BIGINT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE, expires_at BIGINT NOT NULL, used_at BIGINT, created_by BIGINT, created_at BIGINT NOT NULL);
CREATE INDEX pr_user ON password_resets(user_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marquee_app') THEN GRANT SELECT, INSERT, UPDATE ON password_resets TO marquee_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO marquee_app; END IF;
END $$;
