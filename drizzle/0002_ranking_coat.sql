ALTER TABLE games ADD COLUMN coat TEXT CHECK (coat IN ('cheese', 'mackerel', 'white', 'gray'));
