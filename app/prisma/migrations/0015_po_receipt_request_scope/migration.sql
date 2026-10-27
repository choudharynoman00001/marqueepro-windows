-- A receive request id is scoped to the whole purchase order (not one line), so one id cannot apply on two lines and lookup/fence/receive agree.
-- Upgrade from 0014: receipts are never deleted or renamed away. If an older version allowed one id on two lines of the same order, the earliest
-- receipt keeps the id (so replaying that id is answered from that receipt, and a replay for the other line is a conflict, never a new receipt).
-- The later receipts keep their original id in legacy_request_id and are marked legacy_ambiguous for manual reconciliation.
ALTER TABLE purchase_receipts ADD COLUMN po_id BIGINT REFERENCES purchase_orders(id);
ALTER TABLE purchase_receipts ADD COLUMN legacy_request_id TEXT;
ALTER TABLE purchase_receipts ADD COLUMN legacy_ambiguous BIGINT NOT NULL DEFAULT 0;
ALTER TABLE purchase_receipts DISABLE TRIGGER tg_por_ro;
UPDATE purchase_receipts r SET po_id = l.po_id FROM purchase_order_lines l WHERE l.id = r.po_line_id;
UPDATE purchase_receipts r SET legacy_request_id = r.request_id, legacy_ambiguous = 1, request_id = NULL
  WHERE r.request_id IS NOT NULL AND EXISTS (SELECT 1 FROM purchase_receipts e WHERE e.tenant_id = r.tenant_id AND e.po_id = r.po_id AND e.request_id = r.request_id AND e.id < r.id);
ALTER TABLE purchase_receipts ENABLE TRIGGER tg_por_ro;
ALTER TABLE purchase_receipts ALTER COLUMN po_id SET NOT NULL;
DROP INDEX por_request;
CREATE UNIQUE INDEX por_request ON purchase_receipts(tenant_id, po_id, request_id) WHERE request_id IS NOT NULL;
