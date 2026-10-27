-- A voided vendor bill keeps its row; these columns record why, who and when. No amount is changed or reversed by the database.
ALTER TABLE vendor_bills ADD COLUMN void_reason TEXT;
ALTER TABLE vendor_bills ADD COLUMN voided_by BIGINT;
ALTER TABLE vendor_bills ADD COLUMN voided_at TEXT;
