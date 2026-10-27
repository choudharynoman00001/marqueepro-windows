-- Allow the optional AI draft assistant as a per-business connection (the business's own provider account). Off until set up.
ALTER TABLE tenant_integrations DROP CONSTRAINT tenant_integrations_key_check;
ALTER TABLE tenant_integrations ADD CONSTRAINT tenant_integrations_key_check CHECK(key IN ('email','whatsapp_api','ai_assistant'));
