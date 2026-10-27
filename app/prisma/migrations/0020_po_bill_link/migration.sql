-- Optional link from a vendor bill to the purchase order it was raised from. Nothing is calculated by the database; the amount on the bill stays an entered number.
ALTER TABLE vendor_bills ADD COLUMN po_id BIGINT REFERENCES purchase_orders(id);
CREATE INDEX vb_po ON vendor_bills(tenant_id, po_id);
