-- Optional Safepay adapter (the business's own merchant account): hosted checkout created server-side, payment confirmed only by fetching the tracker.
ALTER TABLE tenant_integrations DROP CONSTRAINT tenant_integrations_key_check;
ALTER TABLE tenant_integrations ADD CONSTRAINT tenant_integrations_key_check CHECK(key IN ('email','whatsapp_api','ai_assistant','jazzcash','safepay'));
ALTER TABLE online_payment_requests DROP CONSTRAINT online_payment_requests_provider_check;
ALTER TABLE online_payment_requests ADD CONSTRAINT online_payment_requests_provider_check CHECK(provider IN ('jazzcash','safepay'));
ALTER TABLE online_payment_events DROP CONSTRAINT online_payment_events_provider_check;
ALTER TABLE online_payment_events ADD CONSTRAINT online_payment_events_provider_check CHECK(provider IN ('jazzcash','safepay'));
ALTER TABLE online_payment_requests ADD COLUMN provider_ref TEXT, ADD COLUMN provider_client TEXT;
CREATE UNIQUE INDEX online_payment_requests_provider_ref ON online_payment_requests(tenant_id, provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE UNIQUE INDEX tenant_integrations_safepay_token ON tenant_integrations (((config::jsonb)->>'callback_token')) WHERE key = 'safepay';
