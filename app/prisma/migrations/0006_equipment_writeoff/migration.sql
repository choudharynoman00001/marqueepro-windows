-- "writeoff" records equipment that was issued to an event and will not come back (lost or broken).
-- It never changes stock on hand: the item already left stock when it was issued.
ALTER TABLE stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK(kind IN ('purchase','issue','return','damage','adjust','usage','writeoff'));
