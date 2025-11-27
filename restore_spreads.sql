-- Restore missing spreads for finished games (Nov 26, 2025)

-- Syracuse vs Iowa State (ID 233): ISU -10.5
UPDATE games SET spread = 'ISU -10.5' WHERE id = 233;

-- Notre Dame vs Houston (ID 235): HOU -11.5
UPDATE games SET spread = 'HOU -11.5' WHERE id = 235;

-- Harvard vs Boston College (ID 236): BC -7.5
UPDATE games SET spread = 'BC -7.5' WHERE id = 236;

-- USC vs Arizona State (ID 234): USC -5.5
UPDATE games SET spread = 'USC -5.5' WHERE id = 234;
