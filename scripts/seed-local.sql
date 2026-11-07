-- Local development seed (SYNTHETIC DATA ONLY).
-- Never copy rows from db-copy/ or any real database into this file.
-- Targets the pre-Phase-4 schema (drizzle 0000-0010). It is rewritten for the
-- new schema in upgrade Phase 4.
-- Re-runnable: rows use fixed ids and INSERT OR REPLACE.

-- Rooms (slugs must match src/routes/rooms/*.tsx). No iCal URLs.
INSERT OR REPLACE INTO room (
	id, name, slug, description, base_price, service_fee_rate,
	state_tax_rate, city_tax_rate, status, is_active,
	airbnb_ical_url, expedia_ical_url, last_airbnb_sync, last_expedia_sync,
	created_at, updated_at
) VALUES
	('seed-room-rose', 'Rose Room', 'rose-room', 'Seed data: Rose Room', 100.0, 0.12,
	 0.06, 0.07, 'active', 1, NULL, NULL, NULL, NULL, unixepoch(), unixepoch()),
	('seed-room-texas', 'Texas Room', 'texas-room', 'Seed data: Texas Room', 120.0, 0.12,
	 0.06, 0.07, 'active', 1, NULL, NULL, NULL, NULL, unixepoch(), unixepoch());

-- Pricing rules (inclusive start/end dates).
INSERT OR REPLACE INTO room_pricing_rules (
	id, room_id, name, rule_type, value, start_date, end_date, is_active,
	days_of_week, created_at, updated_at
) VALUES
	-- Covers part of a stay (e.g. a Dec 22-29 stay is partly covered).
	('seed-rule-rose-holiday', 'seed-room-rose', 'Seed: Holiday surcharge',
	 'surcharge_rate', 0.20, '2026-12-24', '2026-12-27', 1, NULL, unixepoch(), unixepoch()),
	-- Single-night rule (start = end).
	('seed-rule-rose-nye', 'seed-room-rose', 'Seed: New Year''s Eve',
	 'absolute_price', 150.0, '2026-12-31', '2026-12-31', 1, NULL, unixepoch(), unixepoch()),
	('seed-rule-texas-fixed', 'seed-room-texas', 'Seed: Fixed add-on',
	 'fixed_amount', 25.0, '2027-01-15', '2027-01-18', 1, NULL, unixepoch(), unixepoch());

-- One admin block (inclusive start/end).
INSERT OR REPLACE INTO room_blocked_periods (
	id, room_id, start_date, end_date, reason, notes, created_at
) VALUES
	('seed-block-texas', 'seed-room-texas', '2026-12-08', '2026-12-10',
	 'Maintenance', 'Seed data', unixepoch());
