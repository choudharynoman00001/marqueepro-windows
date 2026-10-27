-- JazzCash review fixes: only a recorded result is deduplicated (other outcomes stay visible and can be retried or reviewed), new outcomes, indexed callback-token lookup.
ALTER TABLE online_payment_events DROP CONSTRAINT online_payment_events_tenant_id_provider_event_key_key;
CREATE UNIQUE INDEX online_payment_events_recorded_once ON online_payment_events(tenant_id, provider, event_key) WHERE outcome = 'recorded';
CREATE INDEX online_payment_events_request ON online_payment_events(request_id);
ALTER TABLE online_payment_events DROP CONSTRAINT online_payment_events_outcome_check;
ALTER TABLE online_payment_events ADD CONSTRAINT online_payment_events_outcome_check CHECK(outcome IN ('recorded','failed','amount_mismatch','unknown_reference','wrong_merchant','not_recorded','missing_txn_ref','unsupported_type','already_paid'));
CREATE UNIQUE INDEX tenant_integrations_jazzcash_token ON tenant_integrations (((config::jsonb)->>'callback_token')) WHERE key = 'jazzcash';
