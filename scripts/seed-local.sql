-- Local development seed (SYNTHETIC DATA ONLY).
-- Never copy rows from db-copy/ or any real database into this file.
-- Targets the schema in drizzle/ (all migrations applied). Fixed UUIDv7 ids and public ids so tests can
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

-- A synthetic guest with paid bookings, for the Hotel Occupancy Tax report
-- (/admin/reports/tax, docs/TAX_REPORTING.md). Instants are UTC seconds.
INSERT OR REPLACE INTO user (
	id, public_id, name, email, email_verified, role, created_at, updated_at
) VALUES
	('019a5f00-0000-7000-8000-00000000b001', 'seeduserguest001', 'Seed Guest',
	 'seed-guest@example.test', 1, 'user', unixepoch(), unixepoch());

-- Bookings 401, 403 and 404 store the tax snapshot (tax on room + service
-- fee). Booking 402 has none, like a booking made before the snapshot
-- columns existed (tax on the room only): the report marks it "Estimated".
INSERT OR REPLACE INTO bookings (
	id, public_id, confirmation_id, user_id, room_id, check_in_date,
	check_out_date, check_in_at, check_out_at, number_of_nights,
	number_of_guests, base_amount, fees_amount, tax_amount, total_amount,
	taxable_amount, state_tax_rate, city_tax_rate, state_tax_amount,
	city_tax_amount, status, payment_status, guest_name, guest_email,
	refund_amount, cancelled_at, cancelled_by, created_at, updated_at,
	confirmed_at
) VALUES
	('019a5f00-0000-7000-8000-000000000401', 'seedbooking00001', 'SEED01',
	 '019a5f00-0000-7000-8000-00000000b001', '019a5f00-0000-7000-8000-000000000001',
	 '2026-10-10', '2026-10-12', unixepoch('2026-10-10 21:00:00'),
	 unixepoch('2026-10-12 16:00:00'), 2, 2, 200.0, 24.0, 29.12, 253.12,
	 224.0, 0.06, 0.07, 13.44, 15.68, 'confirmed', 'paid', 'Seed Guest',
	 'seed-guest@example.test', NULL, NULL, NULL,
	 unixepoch('2026-10-02 20:00:00'), unixepoch('2026-10-02 20:00:00'),
	 unixepoch('2026-10-02 20:00:00')),
	('019a5f00-0000-7000-8000-000000000402', 'seedbooking00002', 'SEED02',
	 '019a5f00-0000-7000-8000-00000000b001', '019a5f00-0000-7000-8000-000000000002',
	 '2026-10-24', '2026-10-26', unixepoch('2026-10-24 21:00:00'),
	 unixepoch('2026-10-26 16:00:00'), 2, 1, 240.0, 28.8, 31.2, 300.0,
	 NULL, NULL, NULL, NULL, NULL, 'confirmed', 'paid', 'Seed Guest',
	 'seed-guest@example.test', NULL, NULL, NULL,
	 unixepoch('2026-10-20 15:30:00'), unixepoch('2026-10-20 15:30:00'),
	 unixepoch('2026-10-20 15:30:00')),
	('019a5f00-0000-7000-8000-000000000403', 'seedbooking00003', 'SEED03',
	 '019a5f00-0000-7000-8000-00000000b001', '019a5f00-0000-7000-8000-000000000001',
	 '2026-12-05', '2026-12-07', unixepoch('2026-12-05 22:00:00'),
	 unixepoch('2026-12-07 17:00:00'), 2, 2, 200.0, 24.0, 29.12, 253.12,
	 224.0, 0.06, 0.07, 13.44, 15.68, 'cancelled', 'partially_refunded',
	 'Seed Guest', 'seed-guest@example.test', 126.56,
	 unixepoch('2026-11-05 16:00:00'), 'guest',
	 unixepoch('2026-11-03 18:00:00'), unixepoch('2026-11-05 16:00:00'),
	 unixepoch('2026-11-03 18:00:00')),
	('019a5f00-0000-7000-8000-000000000404', 'seedbooking00004', 'SEED04',
	 '019a5f00-0000-7000-8000-00000000b001', '019a5f00-0000-7000-8000-000000000002',
	 '2026-11-20', '2026-11-23', unixepoch('2026-11-20 22:00:00'),
	 unixepoch('2026-11-23 17:00:00'), 3, 2, 360.0, 43.2, 52.41, 455.61,
	 403.2, 0.06, 0.07, 24.19, 28.22, 'confirmed', 'paid', 'Seed Guest',
	 'seed-guest@example.test', NULL, NULL, NULL,
	 unixepoch('2026-11-07 19:00:00'), unixepoch('2026-11-07 19:00:00'),
	 unixepoch('2026-11-07 19:00:00'));

-- One payment per booking (placeholder Stripe ids: never sent to Stripe).
INSERT OR REPLACE INTO payment_transactions (
	id, booking_id, stripe_payment_intent_id, amount, amount_refunded, status,
	payment_method, created_at, updated_at
) VALUES
	('019a5f00-0000-7000-8000-000000000501', '019a5f00-0000-7000-8000-000000000401',
	 'pi_seed_0001', 253.12, 0, 'paid', 'card',
	 unixepoch('2026-10-02 20:00:00'), unixepoch('2026-10-02 20:00:00')),
	('019a5f00-0000-7000-8000-000000000502', '019a5f00-0000-7000-8000-000000000402',
	 'pi_seed_0002', 300.0, 0, 'paid', 'card',
	 unixepoch('2026-10-20 15:30:00'), unixepoch('2026-10-20 15:30:00')),
	('019a5f00-0000-7000-8000-000000000503', '019a5f00-0000-7000-8000-000000000403',
	 'pi_seed_0003', 253.12, 126.56, 'partially_refunded', 'card',
	 unixepoch('2026-11-03 18:00:00'), unixepoch('2026-11-05 16:00:00')),
	('019a5f00-0000-7000-8000-000000000504', '019a5f00-0000-7000-8000-000000000404',
	 'pi_seed_0004', 455.61, 0, 'paid', 'card',
	 unixepoch('2026-11-07 19:00:00'), unixepoch('2026-11-07 19:00:00'));

-- A 50% cancellation refund, and a Dashboard refund that matches no booking
-- (listed in the report but left out of its totals).
INSERT OR REPLACE INTO payment_refunds (
	id, stripe_refund_id, booking_id, stripe_payment_intent_id, source, amount,
	currency, status, reason, stripe_created_at, created_at, updated_at
) VALUES
	('019a5f00-0000-7000-8000-000000000601', 're_seed_0001',
	 '019a5f00-0000-7000-8000-000000000403', 'pi_seed_0003', 'app', 126.56,
	 'usd', 'succeeded', 'requested_by_customer',
	 unixepoch('2026-11-05 16:00:00'), unixepoch('2026-11-05 16:00:00'),
	 unixepoch('2026-11-05 16:00:00')),
	('019a5f00-0000-7000-8000-000000000602', 're_seed_0002', NULL, NULL,
	 'dashboard', 25.0, 'usd', 'succeeded', NULL,
	 unixepoch('2026-11-06 17:00:00'), unixepoch('2026-11-06 17:00:00'),
	 unixepoch('2026-11-06 17:00:00'));
