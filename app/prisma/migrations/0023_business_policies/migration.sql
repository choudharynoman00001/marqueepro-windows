-- Business-owned rules written by each business. All NULL = not configured. No default wording or value is supplied and none is applied automatically.
ALTER TABLE tenants ADD COLUMN cancellation_policy TEXT;
ALTER TABLE tenants ADD COLUMN refund_policy TEXT;
ALTER TABLE tenants ADD COLUMN clearing_policy TEXT;
ALTER TABLE tenants ADD COLUMN retention_policy TEXT;
