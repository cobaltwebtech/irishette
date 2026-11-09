import { Badge } from '@/components/ui/badge';
import type { BookingStatus, PaymentStatus } from '@/lib/booking-status';
import { humanizeCode } from '@/lib/format';

// Status badges shared by the guest and admin booking pages and lists.

type Variant = 'default' | 'secondary' | 'destructive' | 'outline';

const BOOKING_VARIANTS: Record<BookingStatus, Variant> = {
	pending: 'secondary',
	confirmed: 'default',
	cancelled: 'destructive',
};

const PAYMENT_VARIANTS: Record<PaymentStatus, Variant> = {
	pending: 'outline',
	processing: 'secondary',
	paid: 'default',
	partially_refunded: 'secondary',
	refunded: 'secondary',
	refund_pending: 'secondary',
	refund_failed: 'destructive',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
	return (
		<Badge variant={BOOKING_VARIANTS[status]} className="uppercase">
			{status}
		</Badge>
	);
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
	return (
		<Badge variant={PAYMENT_VARIANTS[status]} className="uppercase">
			{humanizeCode(status)}
		</Badge>
	);
}
