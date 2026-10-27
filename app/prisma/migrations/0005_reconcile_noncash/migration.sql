-- Recorded card, digital and cheque movements are kept apart from the bank book until the owner confirms they cleared.
-- A reconciliation stores both numbers so nothing is silently treated as reconciled bank funds.
ALTER TABLE bank_reconciliations ADD COLUMN noncash_pending_minor BIGINT NOT NULL DEFAULT 0;
