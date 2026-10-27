-- Optional client request id so a repeated submit of the same receipt (double click, retry) is recognised and not applied twice.
ALTER TABLE purchase_receipts ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX por_request ON purchase_receipts(tenant_id, po_line_id, request_id) WHERE request_id IS NOT NULL;
