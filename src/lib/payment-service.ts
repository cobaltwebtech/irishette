import { and, eq, gte, lte, or } from 'drizzle-orm';
import { customAlphabet, nanoid } from 'nanoid';
import Stripe from 'stripe';
import { createDrizzle } from '@/db/drizzle-init';
import {
	bookings,
	paymentTransactions,
	room,
	roomAvailability,
	roomPricingRules,
	user,
} from '@/db/schema-export';
import type {
	CreateBookingInput,
	CreateCheckoutSessionInput,
} from './payment-validation';

// Create a custom nanoid generator for confirmation IDs using only uppercase alphanumeric characters
const generateConfirmationId = customAlphabet(
	'ABCDEFGHJKMNPQRSTUVWXYZ0123456789',
	6,
);

/**
 * PaymentService - Handles booking creation and Stripe payment processing
 *
 * This service integrates with the existing room availability system:
 * - Uses the same availability checking logic as the availability router
 * - Checks both room availability records and confirmed bookings
 * - Validates room existence and active status
 * - Provides detailed conflict information for debugging
 *
 * The service respects the room availability calendar and will properly
 * reject bookings that conflict with existing reservations or blocked dates.
 */

interface PaymentEnv {
	DB: D1Database;
	STRIPE_SECRET_KEY: string;
	STRIPE_TRPC_WEBHOOK_SECRET: string;
	BETTER_AUTH_URL: string;
}

export class PaymentService {
	private db: ReturnType<typeof createDrizzle>;
	private stripe: Stripe;

	constructor(env: PaymentEnv) {
		this.db = createDrizzle(env.DB);
		this.stripe = new Stripe(env.STRIPE_SECRET_KEY, {
			apiVersion: '2025-08-27.basil',
		});
	}

	/**
	 * Calculate booking pricing including taxes and fees
	 */
	async calculateBookingPrice(
		roomId: string,
		checkInDate: string,
		checkOutDate: string,
		guestCount: number,
	): Promise<{
		baseAmount: number;
		feesAmount: number;
		taxAmount: number;
		totalAmount: number;
		numberOfNights: number;
		appliedRules: Array<{
			id: string;
			name: string;
			ruleType: string;
			value: number;
			appliedAmount: number;
		}>;
		taxBreakdown: {
			stateTaxRate: number;
			cityTaxRate: number;
			stateTaxAmount: number;
			cityTaxAmount: number;
			totalTaxAmount: number;
			taxableAmount: number;
		};
	}> {
		// Get room pricing
		const roomResult = await this.db
			.select()
			.from(room)
			.where(eq(room.id, roomId));

		if (!roomResult[0]) {
			throw new Error('Room not found');
		}

		const roomData = roomResult[0];

		// Calculate number of nights
		const checkIn = new Date(checkInDate);
		const checkOut = new Date(checkOutDate);
		const numberOfNights = Math.ceil(
			(checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (numberOfNights <= 0) {
			throw new Error('Invalid date range');
		}

		// Get applicable pricing rules for this date range
		const applicableRules = await this.db
			.select()
			.from(roomPricingRules)
			.where(
				and(
					eq(roomPricingRules.roomId, roomId),
					eq(roomPricingRules.isActive, true),
					// Rule must overlap with booking dates
					lte(roomPricingRules.startDate, checkOutDate),
					gte(roomPricingRules.endDate, checkInDate),
				),
			)
			.orderBy(roomPricingRules.startDate); // Order by start date since priority doesn't exist

		// Filter rules by days of week if specified
		const filteredRules = applicableRules.filter((rule) => {
			if (!rule.daysOfWeek) return true;

			try {
				const daysOfWeek = JSON.parse(rule.daysOfWeek) as string[];
				const dayNames = [
					'sunday',
					'monday',
					'tuesday',
					'wednesday',
					'thursday',
					'friday',
					'saturday',
				];

				// Check if any day in the booking range matches the rule's days
				for (
					let d = new Date(checkIn);
					d < checkOut;
					d.setDate(d.getDate() + 1)
				) {
					const dayName = dayNames[d.getDay()];
					if (daysOfWeek.includes(dayName)) {
						return true;
					}
				}
				return false;
			} catch {
				return true; // If parsing fails, include the rule
			}
		});

		// Apply pricing rules to calculate final price per night
		let finalPricePerNight = roomData.basePrice;
		const appliedRules: Array<{
			id: string;
			name: string;
			ruleType: string;
			value: number;
			appliedAmount: number;
		}> = [];

		// Apply all matching rules
		// Note: Without priority system, we apply rules in the order they appear
		// For absolute_price rules, the last one wins
		let hasAbsolutePrice = false;

		for (const rule of filteredRules) {
			let appliedAmount = 0;

			switch (rule.ruleType) {
				case 'surcharge_rate':
					if (!hasAbsolutePrice) {
						appliedAmount = roomData.basePrice * rule.value;
						finalPricePerNight += appliedAmount;
					}
					break;
				case 'fixed_amount':
					if (!hasAbsolutePrice) {
						appliedAmount = rule.value;
						finalPricePerNight += appliedAmount;
					}
					break;
				case 'absolute_price':
					appliedAmount = rule.value - roomData.basePrice;
					finalPricePerNight = rule.value;
					hasAbsolutePrice = true;
					// Reset previous adjustments since absolute price overrides everything
					appliedRules.length = 0;
					break;
			}

			appliedRules.push({
				id: rule.id,
				name: rule.name,
				ruleType: rule.ruleType,
				value: rule.value,
				appliedAmount,
			});
		}

		// Base calculation with dynamic pricing
		const baseAmount = finalPricePerNight * numberOfNights;

		// Use the room's service fee rate
		const serviceFeeRate = roomData.serviceFeeRate;

		// Guest count could affect pricing in the future
		// For now, we store it but don't use it in calculations
		const guestMultiplier = guestCount > 4 ? 1.1 : 1.0; // Small fee for large groups

		// Apply guest multiplier to base amount
		const adjustedBaseAmount = baseAmount * guestMultiplier;

		// Calculate Hotel Occupancy Tax on room price only (excluding service fees)
		const stateTaxAmount = adjustedBaseAmount * roomData.stateTaxRate; // Texas state tax (6%)
		const cityTaxAmount = adjustedBaseAmount * roomData.cityTaxRate; // Dublin city tax (7%)
		const totalTaxAmount = stateTaxAmount + cityTaxAmount;

		// Calculate service fee on the adjusted base amount (no tax on service fees)
		const serviceFee = adjustedBaseAmount * serviceFeeRate;

		// Total amount includes room price + service fees + hotel occupancy tax
		const totalAmount = adjustedBaseAmount + serviceFee + totalTaxAmount;

		return {
			baseAmount: Math.round(adjustedBaseAmount * 100) / 100, // Round to nearest cent
			feesAmount: Math.round(serviceFee * 100) / 100, // Round to nearest cent
			taxAmount: Math.round(totalTaxAmount * 100) / 100, // Hotel occupancy tax
			totalAmount: Math.round(totalAmount * 100) / 100, // Round to nearest cent
			numberOfNights,
			appliedRules,
			// Add detailed tax breakdown for reporting
			taxBreakdown: {
				stateTaxRate: roomData.stateTaxRate,
				cityTaxRate: roomData.cityTaxRate,
				stateTaxAmount: Math.round(stateTaxAmount * 100) / 100,
				cityTaxAmount: Math.round(cityTaxAmount * 100) / 100,
				totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
				taxableAmount: Math.round(adjustedBaseAmount * 100) / 100, // Only room price is taxable
			},
		};
	}

	/**
	 * Check room availability using the same logic as the availability router
	 */
	async checkRoomAvailability(
		roomId: string,
		startDate: string,
		endDate: string,
	): Promise<{
		available: boolean;
		conflictingBookings: Array<{
			bookingId: string;
			confirmationId: string;
			checkInDate: string;
			checkOutDate: string;
		}>;
		externalConflicts: Array<{
			date: string;
			source: string | null;
			externalBookingId: string | null;
		}>;
	}> {
		// Validate date range
		const startDateObj = new Date(startDate);
		const endDateObj = new Date(endDate);

		if (startDateObj >= endDateObj) {
			throw new Error('Start date must be before end date');
		}

		// Check if room exists and is active
		const roomResult = await this.db
			.select()
			.from(room)
			.where(and(eq(room.id, roomId), eq(room.isActive, true)));

		if (!roomResult[0]) {
			throw new Error('Room not found or inactive');
		}

		// Check availability records for blocked dates
		const availabilityResult = await this.db
			.select()
			.from(roomAvailability)
			.where(
				and(
					eq(roomAvailability.roomId, roomId),
					gte(roomAvailability.date, startDate),
					lte(roomAvailability.date, endDate),
					eq(roomAvailability.isBlocked, true),
				),
			);

		// Check confirmed bookings for overlapping date ranges
		const bookingResult = await this.db
			.select()
			.from(bookings)
			.where(
				and(
					eq(bookings.roomId, roomId),
					eq(bookings.status, 'confirmed'),
					// Check for overlapping date ranges: booking starts before our end AND booking ends after our start
					or(
						and(
							lte(bookings.checkInDate, endDate),
							gte(bookings.checkOutDate, startDate),
						),
					),
				),
			);

		const conflictingAvailability = availabilityResult.map((record) => ({
			date: record.date,
			source: record.source,
			externalBookingId: record.externalBookingId,
		}));

		const conflictingBookings = bookingResult.map((booking) => ({
			bookingId: booking.id,
			confirmationId: booking.confirmationId,
			checkInDate: booking.checkInDate,
			checkOutDate: booking.checkOutDate,
		}));

		const available =
			conflictingAvailability.length === 0 && conflictingBookings.length === 0;

		return {
			available,
			conflictingBookings,
			externalConflicts: conflictingAvailability,
		};
	}

	/**
	 * Create a temporary booking record before Stripe checkout
	 * This allows us to reserve the dates and store booking details
	 */
	async createTemporaryBooking(
		bookingData: CreateBookingInput,
		userId: string,
	): Promise<string> {
		const bookingId = nanoid();

		// Use the comprehensive availability checking system
		try {
			const availabilityCheck = await this.checkRoomAvailability(
				bookingData.roomId,
				bookingData.checkInDate,
				bookingData.checkOutDate,
			);

			if (!availabilityCheck.available) {
				const conflicts = [];

				if (availabilityCheck.conflictingBookings.length > 0) {
					conflicts.push(
						`${availabilityCheck.conflictingBookings.length} existing booking(s)`,
					);
				}

				if (availabilityCheck.externalConflicts.length > 0) {
					conflicts.push(
						`${availabilityCheck.externalConflicts.length} external conflict(s)`,
					);
				}

				throw new Error(
					`Room not available for selected dates. Conflicts: ${conflicts.join(', ')}`,
				);
			}
		} catch (error) {
			// If room doesn't exist, it might be using the wrong ID
			// Check if we're using development IDs and map to actual database IDs
			if (
				error instanceof Error &&
				error.message === 'Room not found or inactive'
			) {
				let actualRoomId = bookingData.roomId;

				// Map development IDs to actual database IDs
				if (bookingData.roomId === 'rose-room-id') {
					actualRoomId = 'biolbnhax7ZK9ctPpb2rq'; // Actual Rose Room ID from database
				} else if (bookingData.roomId === 'texas-room-id') {
					actualRoomId = 'qSDFP06DGD7v8M3rC3DwE'; // Actual Texas Room ID from database
				}

				// If we mapped to a different ID, retry the availability check
				if (actualRoomId !== bookingData.roomId) {
					const retryCheck = await this.checkRoomAvailability(
						actualRoomId,
						bookingData.checkInDate,
						bookingData.checkOutDate,
					);

					if (!retryCheck.available) {
						throw new Error('Room not available for selected dates');
					}

					// Update the booking data with the correct room ID
					bookingData.roomId = actualRoomId;
				} else {
					// Re-throw the original error if it's not a known development room
					throw error;
				}
			} else {
				// Re-throw any other error
				throw error;
			}
		}

		// Calculate pricing
		const pricing = await this.calculateBookingPrice(
			bookingData.roomId,
			bookingData.checkInDate,
			bookingData.checkOutDate,
			bookingData.guestCount,
		);

		// Create temporary booking
		await this.db.insert(bookings).values({
			id: bookingId,
			userId,
			roomId: bookingData.roomId,
			confirmationId: generateConfirmationId(),
			checkInDate: bookingData.checkInDate,
			checkOutDate: bookingData.checkOutDate,
			numberOfNights: pricing.numberOfNights,
			numberOfGuests: bookingData.guestCount,
			guestName: bookingData.guestName,
			guestEmail: bookingData.guestEmail,
			guestPhone: bookingData.guestPhone,
			specialRequests: bookingData.specialRequests,
			baseAmount: pricing.baseAmount,
			feesAmount: pricing.feesAmount,
			taxAmount: pricing.taxAmount,
			totalAmount: pricing.totalAmount,
			status: 'pending', // Temporary status until payment confirmed
			paymentStatus: 'pending',
		});

		return bookingId;
	}

	/**
	 * Create Stripe checkout session for booking payment
	 */
	async createCheckoutSession(
		bookingId: string,
		input: CreateCheckoutSessionInput,
	): Promise<{
		sessionId: string;
		checkoutUrl: string;
	}> {
		// Get booking details
		const bookingResult = await this.db
			.select()
			.from(bookings)
			.where(eq(bookings.id, bookingId));

		if (!bookingResult[0]) {
			throw new Error('Booking not found');
		}

		const booking = bookingResult[0];

		// Get user's Stripe customer ID (created by Better Auth)
		const userResult = await this.db
			.select()
			.from(user)
			.where(eq(user.id, booking.userId));

		if (!userResult[0] || !userResult[0].stripeCustomerId) {
			throw new Error('Customer not found or not linked to Stripe');
		}

		const customer = userResult[0];

		// Get room details for line item and tax calculation
		const roomResult = await this.db
			.select()
			.from(room)
			.where(eq(room.id, booking.roomId));

		if (!roomResult[0]) {
			throw new Error('Room not found');
		}

		const roomData = roomResult[0];

		// Calculate tax breakdown for display
		const stateTaxAmount = booking.baseAmount * roomData.stateTaxRate;
		const cityTaxAmount = booking.baseAmount * roomData.cityTaxRate;

		// Create line items for Stripe
		const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: `Room Booking - ${roomData.slug}`,
						description: `${booking.numberOfNights} nights • ${booking.checkInDate} to ${booking.checkOutDate} • ${booking.numberOfGuests} guests`,
						metadata: {
							booking_id: bookingId,
							room_id: booking.roomId,
							check_in: booking.checkInDate,
							check_out: booking.checkOutDate,
						},
					},
					unit_amount: Math.round(booking.baseAmount * 100), // Convert to cents, ensure integer
				},
				quantity: 1,
			},
		];

		// Add fees if applicable
		if (booking.feesAmount && booking.feesAmount > 0) {
			lineItems.push({
				price_data: {
					currency: 'usd',
					product_data: {
						name: 'Service & Cleaning Fees',
					},
					unit_amount: Math.round(booking.feesAmount * 100), // Ensure integer cents
				},
				quantity: 1,
			});
		}

		// Add detailed tax line items using calculated amounts
		if (booking.taxAmount && booking.taxAmount > 0) {
			// Add Texas State Hotel Occupancy Tax (6%)
			if (stateTaxAmount > 0) {
				lineItems.push({
					price_data: {
						currency: 'usd',
						product_data: {
							name: 'Texas Hotel Occupancy Tax',
							description: `State tax (${roomData.stateTaxRate * 100}%) on room price of $${booking.baseAmount.toFixed(2)}`,
							metadata: {
								tax_type: 'state_hotel_occupancy_tax',
								tax_rate: roomData.stateTaxRate.toString(),
								taxable_amount: booking.baseAmount.toString(),
								jurisdiction: 'Texas',
							},
						},
						unit_amount: Math.round(stateTaxAmount * 100), // Ensure integer cents
					},
					quantity: 1,
				});
			}

			// Add Dublin City Hotel Occupancy Tax (7%)
			if (cityTaxAmount > 0) {
				lineItems.push({
					price_data: {
						currency: 'usd',
						product_data: {
							name: 'Dublin Hotel Occupancy Tax',
							description: `City tax (${roomData.cityTaxRate * 100}%) on room price of $${booking.baseAmount.toFixed(2)}`,
							metadata: {
								tax_type: 'city_hotel_occupancy_tax',
								tax_rate: roomData.cityTaxRate.toString(),
								taxable_amount: booking.baseAmount.toString(),
								jurisdiction: 'Dublin, TX',
							},
						},
						unit_amount: Math.round(cityTaxAmount * 100), // Ensure integer cents
					},
					quantity: 1,
				});
			}
		}

		// Create Stripe checkout session
		const session = await this.stripe.checkout.sessions.create({
			customer: customer.stripeCustomerId || undefined,
			payment_method_types: ['card'],
			line_items: lineItems,
			mode: 'payment',
			success_url: input.successUrl,
			cancel_url: input.cancelUrl,
			// Require complete billing address collection
			billing_address_collection: 'required',
			metadata: {
				booking_id: bookingId,
				user_id: booking.userId,
				room_id: booking.roomId,
				type: 'room_booking',
			},
			expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Expire in 30 minutes
		});

		// Create payment transaction record
		const transactionId = nanoid();
		await this.db.insert(paymentTransactions).values({
			id: transactionId,
			bookingId,
			stripePaymentIntentId: session.payment_intent as string,
			stripeCustomerId: customer.stripeCustomerId || '',
			amount: booking.totalAmount,
			status: 'pending',
			paymentMethod: 'card',
		});

		if (!session.url) {
			throw new Error('Failed to create checkout session URL');
		}

		return {
			sessionId: session.id,
			checkoutUrl: session.url,
		};
	}

	/**
	 * Handle successful payment confirmation
	 * Called by Stripe webhook when checkout.session.completed
	 */
	/**
	 * Enhanced booking confirmation with complete data finalization
	 */
	async confirmBookingPayment(sessionId: string): Promise<void> {
		console.log('Starting booking confirmation for session:', sessionId);

		// Get Stripe session details
		const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
			expand: ['payment_intent', 'customer'],
		});

		if (session.payment_status !== 'paid') {
			throw new Error(
				`Payment not completed. Status: ${session.payment_status}`,
			);
		}

		const bookingId = session.metadata?.booking_id;
		if (!bookingId) {
			throw new Error('Booking ID not found in session metadata');
		}

		console.log('Confirming booking:', bookingId);

		// Get current booking details
		const bookingResult = await this.db
			.select()
			.from(bookings)
			.where(eq(bookings.id, bookingId));

		if (!bookingResult[0]) {
			throw new Error(`Booking not found: ${bookingId}`);
		}

		const booking = bookingResult[0];

		// Extract payment intent ID (it could be a string or an object)
		const paymentIntentId =
			typeof session.payment_intent === 'string'
				? session.payment_intent
				: session.payment_intent?.id;

		if (!paymentIntentId) {
			throw new Error('Payment intent ID not found in session');
		}

		// Update booking status with complete payment information
		const updateData = {
			status: 'confirmed' as const,
			paymentStatus: 'paid' as const,
			confirmedAt: new Date(),
			updatedAt: new Date(),
			// Store additional payment metadata for reference
			stripeSessionId: sessionId,
			stripePaymentIntentId: paymentIntentId,
		};

		await this.db
			.update(bookings)
			.set(updateData)
			.where(eq(bookings.id, bookingId));

		// Update payment transaction status with complete details
		await this.db
			.update(paymentTransactions)
			.set({
				status: 'succeeded',
				stripePaymentIntentId: paymentIntentId,
			})
			.where(eq(paymentTransactions.bookingId, bookingId));

		console.log('Booking confirmed successfully:', {
			bookingId,
			sessionId,
			paymentIntentId: paymentIntentId,
			amount: booking.totalAmount,
			guestEmail: booking.guestEmail,
		});

		// Block dates in room availability table
		await this.blockRoomDates(
			booking.roomId,
			booking.checkInDate,
			booking.checkOutDate,
		);

		// Note: Confirmation email is sent by the webhook handler after payment confirmation

		console.log('Post-booking workflows completed for:', bookingId);
	}

	/**
	 * Handle cancelled/failed payments
	 */
	async handlePaymentFailure(sessionId: string): Promise<void> {
		const session = await this.stripe.checkout.sessions.retrieve(sessionId);
		const bookingId = session.metadata?.booking_id;

		if (!bookingId) {
			throw new Error('Booking ID not found in session metadata');
		}

		// Update booking status to cancelled
		await this.db
			.update(bookings)
			.set({
				status: 'cancelled',
				paymentStatus: 'failed',
				updatedAt: new Date(),
			})
			.where(eq(bookings.id, bookingId));

		// Update payment transaction status
		await this.db
			.update(paymentTransactions)
			.set({
				status: 'failed',
			})
			.where(eq(paymentTransactions.bookingId, bookingId));
	}

	/**
	 * Get booking with payment details and room information
	 */
	async getBookingWithPayment(bookingId: string) {
		const bookingResult = await this.db
			.select({
				booking: bookings,
				room: room,
			})
			.from(bookings)
			.innerJoin(room, eq(bookings.roomId, room.id))
			.where(eq(bookings.id, bookingId));

		if (!bookingResult[0]) {
			throw new Error('Booking not found');
		}

		const { booking, room: roomData } = bookingResult[0];

		// Get payment transaction details
		const paymentResult = await this.db
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, bookingId));

		return {
			booking,
			room: roomData,
			paymentDetails: paymentResult[0] || null,
		};
	}

	/**
	 * Get booking with payment details, room information, and user data (for admin)
	 */
	async getBookingWithPaymentAndUser(bookingId: string) {
		const bookingResult = await this.db
			.select({
				booking: bookings,
				room: room,
				user: {
					id: user.id,
					email: user.email,
					name: user.name,
				},
			})
			.from(bookings)
			.innerJoin(room, eq(bookings.roomId, room.id))
			.innerJoin(user, eq(bookings.userId, user.id))
			.where(eq(bookings.id, bookingId));

		if (!bookingResult[0]) {
			throw new Error('Booking not found');
		}

		const { booking, room: roomData, user: userData } = bookingResult[0];

		// Get payment transaction details
		const paymentResult = await this.db
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, bookingId));

		return {
			booking,
			room: roomData,
			user: userData,
			paymentDetails: paymentResult[0] || null,
		};
	}

	/**
	 * Get booking details by Stripe session ID
	 */
	async getBookingByStripeSessionId(stripeSessionId: string) {
		const bookingResult = await this.db
			.select({
				booking: bookings,
				room: room,
			})
			.from(bookings)
			.innerJoin(room, eq(bookings.roomId, room.id))
			.where(eq(bookings.stripeSessionId, stripeSessionId));

		if (!bookingResult[0]) {
			throw new Error('Booking not found for Stripe session ID');
		}

		const { booking, room: roomData } = bookingResult[0];

		// Get payment transaction details
		const paymentResult = await this.db
			.select()
			.from(paymentTransactions)
			.where(eq(paymentTransactions.bookingId, booking.id));

		return {
			booking,
			room: roomData,
			paymentDetails: paymentResult[0] || null,
		};
	}

	/**
	 * Block room dates in availability table after successful booking
	 */
	private async blockRoomDates(
		roomId: string,
		checkInDate: string,
		checkOutDate: string,
	): Promise<void> {
		try {
			console.log('Blocking room dates:', {
				roomId,
				checkInDate,
				checkOutDate,
			});

			// Generate all dates between check-in and check-out
			const startDate = new Date(checkInDate);
			const endDate = new Date(checkOutDate);
			const dates: string[] = [];

			const currentDate = new Date(startDate);
			while (currentDate < endDate) {
				dates.push(currentDate.toISOString().split('T')[0]);
				currentDate.setDate(currentDate.getDate() + 1);
			}

			// Insert blocked dates into room availability
			for (const date of dates) {
				try {
					await this.db.insert(roomAvailability).values({
						id: nanoid(),
						roomId,
						date,
						isBlocked: true,
						source: 'booking_confirmed',
						externalBookingId: null, // This is an internal booking
						createdAt: new Date(),
						updatedAt: new Date(),
					});
				} catch {
					// If date already exists, update it
					await this.db
						.update(roomAvailability)
						.set({
							isBlocked: true,
							source: 'booking_confirmed',
							updatedAt: new Date(),
						})
						.where(
							and(
								eq(roomAvailability.roomId, roomId),
								eq(roomAvailability.date, date),
							),
						);
				}
			}

			console.log('Room dates blocked successfully:', dates.length, 'dates');
		} catch (error) {
			console.error('Failed to block room dates:', error);
			// Don't throw here - booking is already confirmed, this is just cleanup
		}
	}
}
