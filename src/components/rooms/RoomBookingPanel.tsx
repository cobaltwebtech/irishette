import { Icon } from '@iconify/react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';

import RoomAvailabilityCalendar from '@/components/RoomAvailabilityCalendar';
import BookingInfo from '@/components/RoomBookingInfo';
import { buttonVariants } from '@/components/ui/button';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { useBookingStore } from '@/stores';
import type { PricingBreakdown } from '@/stores/booking-store';
import { toISODateString } from '@/utils/booking-utils';
import { cn } from '@/utils/twMerge';

type Room = Pick<
	RouterOutputs['rooms']['get'],
	'id' | 'slug' | 'name' | 'maxGuests'
>;

interface RoomBookingPanelProps {
	/** The room from the page's route loader. */
	room: Room;
	/** Gradient start class for the section background. */
	backgroundClassName: string;
	/** The other room, suggested when these dates don't work. */
	otherRoom: {
		to: '/rooms/rose-room' | '/rooms/texas-room';
		name: string;
		icon: string;
		iconClassName: string;
	};
}

const NO_PRICING: PricingBreakdown = {
	basePrice: 0,
	nights: 0,
	subtotal: 0,
	taxes: 0,
	fees: 0,
	totalAmount: 0,
	currency: 'USD',
};

/**
 * Availability calendar and price summary for a room page. Picking dates
 * fills the booking store; "Book now" starts the /booking flow.
 */
export function RoomBookingPanel({
	room,
	backgroundClassName,
	otherRoom,
}: RoomBookingPanelProps) {
	const [selectedDateRange, setSelectedDateRange] = useState<DateRange>();
	const [totalPrice, setTotalPrice] = useState(0);
	const [nights, setNights] = useState(0);
	const booking = useBookingStore();
	const navigate = useNavigate();

	// Start a booking for this room (also replaces drafts saved with an old
	// room id).
	useEffect(() => {
		if (booking.roomId !== room.id) {
			booking.actions.initializeBooking(
				room.id,
				room.slug,
				room.name,
				room.maxGuests,
			);
		}
	}, [booking.roomId, booking.actions, room]);

	const handleDateRangeSelect = (
		dateRange: DateRange | undefined,
		totalPriceValue?: number,
		nightsValue?: number,
	) => {
		setSelectedDateRange(dateRange);
		setTotalPrice(totalPriceValue || 0);
		setNights(nightsValue || 0);

		if (!dateRange?.from || !dateRange?.to) {
			booking.actions.setDates('', '');
			booking.actions.setPricing(NO_PRICING);
			return;
		}

		booking.actions.setDates(
			toISODateString(dateRange.from),
			toISODateString(dateRange.to),
		);
		// Base room cost only: fees and taxes are calculated in the booking flow.
		if (totalPriceValue && nightsValue) {
			booking.actions.setPricing({
				...NO_PRICING,
				basePrice: totalPriceValue / nightsValue,
				nights: nightsValue,
				subtotal: totalPriceValue,
				totalAmount: totalPriceValue,
			});
		}
	};

	const handleBookNow = () => {
		if (!selectedDateRange?.from || !selectedDateRange?.to) return;
		if (!booking.roomId || !booking.checkInDate || !booking.checkOutDate) {
			console.warn('Booking validation failed: Missing room or dates');
			return;
		}
		booking.actions.setStep('auth');
		void navigate({ to: '/booking' });
	};

	return (
		<section
			className={cn(
				'scroll-mt-20 bg-linear-to-b to-background px-4 py-16',
				backgroundClassName,
			)}
			data-calendar-section
		>
			<div className="container mx-auto max-w-5xl">
				<div className="mb-12 text-center">
					<h2 className="mb-4 flex flex-col items-center justify-center gap-2 text-3xl font-bold">
						<Icon icon="tabler:calendar-week" className="size-12 text-accent" />
						<span>Select Dates to Book Now</span>
					</h2>
					<p className="text-lg text-muted-foreground">
						Select your preferred dates to see availability and pricing
					</p>
				</div>

				<div className="grid justify-center gap-8 lg:grid-cols-2">
					<div className="flex justify-center">
						<div className="w-full max-w-2xl">
							<RoomAvailabilityCalendar
								roomSlug={room.slug}
								selectedDateRange={selectedDateRange}
								onDateRangeSelect={handleDateRangeSelect}
								minNights={1}
								maxNights={30}
							/>
						</div>
					</div>

					<BookingInfo
						selectedDateRange={selectedDateRange}
						totalPrice={totalPrice}
						nights={nights}
						onBookNow={handleBookNow}
						roomName={room.name}
					/>
				</div>
				<div className="mt-8 flex flex-col items-center gap-4">
					<p>
						Can't find the dates you need? Check out the {otherRoom.name}{' '}
						availability.
					</p>
					<Link
						to={otherRoom.to}
						data-slot="button"
						className={cn(buttonVariants({ variant: 'secondary' }))}
					>
						<Icon
							icon={otherRoom.icon}
							className={cn('size-6', otherRoom.iconClassName)}
						/>
						View {otherRoom.name}
					</Link>
					<p>
						<span className="bg-red-300 font-bold">
							DO WE NEED ANYTHING ABOUT PETS OR OTHER NOT ALLOWED ITEMS
							(ALCOHOL, MUSIC, ETC)?
						</span>
					</p>
				</div>
			</div>
		</section>
	);
}
