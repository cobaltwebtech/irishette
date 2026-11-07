-- Local development seed (SYNTHETIC DATA ONLY).
-- Never copy rows from db-copy/ or any real database into this file.
-- Targets drizzle/0000_init.sql. Fixed UUIDv7 ids and public ids so tests can
-- reference them. Re-runnable (INSERT OR REPLACE).
-- The export tokens below are local-only test values, not secrets.

-- Rooms (slugs must match src/routes/rooms/*.tsx).
INSERT OR REPLACE INTO room (
	id, public_id, name, slug, description, base_price, service_fee_rate,
	state_tax_rate, city_tax_rate, max_guests, ical_export_token, status,
	is_active, created_at, updated_at
) VALUES
	('019a5f00-0000-7000-8000-000000000001', 'seedroomrose0001', 'Rose Room',
	 'rose-room', 'Seed data: Rose Room', 100.0, 0.12, 0.06, 0.07, 2,
	 'mg8wQCtXTOJmHZ8Sc5XXzOWlUGxNDJHbDz-oXiHa0Mc', 'active', 1,
	 unixepoch(), unixepoch()),
	('019a5f00-0000-7000-8000-000000000002', 'seedroomtexas001', 'Texas Room',
	 'texas-room', 'Seed data: Texas Room', 120.0, 0.12, 0.06, 0.07, 2,
	 'bDzaNwnCM1aT1qTr7UEpLzRw0nr9VJbKMtwqB9IisU0', 'active', 1,
	 unixepoch(), unixepoch());

-- Pricing rules (inclusive start/end dates).
INSERT OR REPLACE INTO room_pricing_rules (
	id, room_id, name, rule_type, value, start_date, end_date, is_active,
	activated_at, created_at, updated_at
) VALUES
	-- Covers part of a stay (e.g. a Dec 22-29 stay is partly covered).
	('019a5f00-0000-7000-8000-000000000101', '019a5f00-0000-7000-8000-000000000001',
	 'Seed: Holiday surcharge', 'surcharge_rate', 0.20, '2026-12-24', '2026-12-27',
	 1, unixepoch(), unixepoch(), unixepoch()),
	-- Single-night rule (start = end).
	('019a5f00-0000-7000-8000-000000000102', '019a5f00-0000-7000-8000-000000000001',
	 'Seed: New Year''s Eve', 'absolute_price', 150.0, '2026-12-31', '2026-12-31',
	 1, unixepoch(), unixepoch(), unixepoch()),
	-- Inactive rule overlapping the active holiday rule (allowed while inactive).
	('019a5f00-0000-7000-8000-000000000103', '019a5f00-0000-7000-8000-000000000001',
	 'Seed: Inactive overlap', 'fixed_amount', 10.0, '2026-12-26', '2026-12-28',
	 0, NULL, unixepoch(), unixepoch()),
	('019a5f00-0000-7000-8000-000000000104', '019a5f00-0000-7000-8000-000000000002',
	 'Seed: Fixed add-on', 'fixed_amount', 25.0, '2027-01-15', '2027-01-18',
	 1, unixepoch(), unixepoch(), unixepoch());

-- One admin block (inclusive start/end).
INSERT OR REPLACE INTO room_blocked_periods (
	id, room_id, start_date, end_date, reason, notes, created_at
) VALUES
	('019a5f00-0000-7000-8000-000000000201', '019a5f00-0000-7000-8000-000000000002',
	 '2026-12-08', '2026-12-10', 'Maintenance', 'Seed data', unixepoch());

-- One INACTIVE iCal feed per room with a placeholder URL, so the cron never
-- fetches a real calendar.
INSERT OR REPLACE INTO ical_feeds (
	id, room_id, source, label, url, is_active, created_at, updated_at
) VALUES
	('019a5f00-0000-7000-8000-000000000301', '019a5f00-0000-7000-8000-000000000001',
	 'airbnb', 'Seed placeholder', 'https://example.invalid/rose-room.ics', 0,
	 unixepoch(), unixepoch()),
	('019a5f00-0000-7000-8000-000000000302', '019a5f00-0000-7000-8000-000000000002',
	 'expedia', 'Seed placeholder', 'https://example.invalid/texas-room.ics', 0,
	 unixepoch(), unixepoch());
