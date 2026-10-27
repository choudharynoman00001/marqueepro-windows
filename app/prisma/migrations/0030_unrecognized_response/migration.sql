-- Safepay answers whose shape is not recognised are kept as one deduplicated, content-free event so drift stays visible to staff.
ALTER TABLE online_payment_events DROP CONSTRAINT online_payment_events_outcome_check;
ALTER TABLE online_payment_events ADD CONSTRAINT online_payment_events_outcome_check CHECK(outcome IN ('recorded','failed','amount_mismatch','unknown_reference','wrong_merchant','not_recorded','missing_txn_ref','unsupported_type','already_paid','unrecognized_response'));
