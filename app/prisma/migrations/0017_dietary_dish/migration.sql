-- Optional link from a dietary requirement line to one dish of that booking's menu. Existing rows stay unlinked (NULL = applies to the whole booking).
ALTER TABLE booking_dietary ADD COLUMN menu_item_id BIGINT REFERENCES menu_items(id);
