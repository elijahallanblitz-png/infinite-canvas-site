-- A small animated character next to each person's name.
ALTER TABLE people ADD COLUMN icon TEXT;
UPDATE people SET icon = 'surfer' WHERE name = 'Elijah';
UPDATE people SET icon = 'adventurer' WHERE name = 'Nevan';
UPDATE people SET icon = 'hero' WHERE name = 'Gregory';
