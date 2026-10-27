-- How many days ahead the owner wants to be warned about a vendor contract end date. NULL = no warning. No default value is chosen for the business.
ALTER TABLE tenants ADD COLUMN contract_reminder_days BIGINT CHECK(contract_reminder_days IS NULL OR (contract_reminder_days >= 0 AND contract_reminder_days <= 365));
