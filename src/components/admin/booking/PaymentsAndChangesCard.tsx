import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { MODIFICATION_KIND_LABELS } from '@/lib/booking/modification-rules';
import { formatMoney } from '@/utils/format';
import { formatDateTimeCT, formatStayDate } from '@/utils/timezone';

// Admin booking page (plan 06): every payment on the booking (checkout and
// extra charges for changes), every refund, and the reservation changes
// with their before/after and where the money went.

type AdminBooking = RouterOutputs['bookings']['adminGetBooking'];

interface PaymentsAndChangesCardProps {
	className?: string;
	payments: AdminBooking['paymentTransactions'];
	refunds: AdminBooking['paymentRefunds'];
	modifications: AdminBooking['bookingModifications'];
}

const stay = (checkIn: string, checkOut: string) =>
	`${formatStayDate(checkIn)} to ${formatStayDate(checkOut)}`;

export function PaymentsAndChangesCard({
	className,
	payments,
	refunds,
	modifications,
}: PaymentsAndChangesCardProps) {
	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>Payments and changes</CardTitle>
				<CardDescription>
					Reservations are changed by phone only, from Modify Reservation.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6 lg:grid-cols-3">
				<section className="space-y-2">
					<h3 className="font-semibold">Payments</h3>
					{payments.length === 0 && (
						<p className="text-sm text-muted-foreground">No payments yet.</p>
					)}
					{payments.map((p) => (
						<div key={p.id} className="rounded-md border p-3 text-sm">
							<p className="font-semibold">{formatMoney(p.amount)}</p>
							<p className="text-muted-foreground">
								{p.cardBrand && p.cardLast4
									? `${p.cardBrand} ending ${p.cardLast4}`
									: (p.paymentMethod ?? 'card')}
								{' · '}
								{formatDateTimeCT(p.createdAt)}
							</p>
							<p className="text-muted-foreground">
								{p.status.replace('_', ' ')}
								{p.amountRefunded > 0 &&
									`, ${formatMoney(p.amountRefunded)} refunded`}
							</p>
						</div>
					))}
				</section>
				<section className="space-y-2">
					<h3 className="font-semibold">Refunds</h3>
					{refunds.length === 0 && (
						<p className="text-sm text-muted-foreground">No refunds.</p>
					)}
					{refunds.map((r) => (
						<div key={r.id} className="rounded-md border p-3 text-sm">
							<p className="font-semibold">{formatMoney(r.amount)}</p>
							<p className="text-muted-foreground">
								{r.status} · {r.source === 'app' ? 'by the site' : 'in Stripe'}
								{' · '}
								{formatDateTimeCT(r.createdAt)}
							</p>
						</div>
					))}
				</section>
				<section className="space-y-2">
					<h3 className="font-semibold">Reservation changes</h3>
					{modifications.length === 0 && (
						<p className="text-sm text-muted-foreground">No changes.</p>
					)}
					{modifications.map((m) => (
						<div key={m.id} className="rounded-md border p-3 text-sm">
							<p className="font-semibold">
								{MODIFICATION_KIND_LABELS[m.kind]}
								{m.kind === 'release_early' &&
									`, originally ${stay(m.previousCheckInDate, m.previousCheckOutDate)}`}
							</p>
							{m.kind !== 'release_early' && (
								<p className="text-muted-foreground">
									{stay(m.previousCheckInDate, m.previousCheckOutDate)} →{' '}
									{stay(m.newCheckInDate, m.newCheckOutDate)}
								</p>
							)}
							<p className="text-muted-foreground">
								{m.differenceCents === 0
									? 'No money moved'
									: `${m.differenceCents > 0 ? 'Charged' : 'Refunded'} ${formatMoney(Math.abs(m.differenceCents) / 100)}`}
								{m.status !== 'applied' && ` · ${m.status.replace('_', ' ')}`}
								{' · '}
								{formatDateTimeCT(m.createdAt)}
							</p>
							{m.note && <p className="italic">{m.note}</p>}
						</div>
					))}
				</section>
			</CardContent>
		</Card>
	);
}
