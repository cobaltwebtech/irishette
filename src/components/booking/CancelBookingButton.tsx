import { Icon } from '@iconify/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatMoney } from '@/lib/format';

const currency = (amount: number) => formatMoney(amount);

type RefundMode = 'policy' | 'full' | 'none';
type Quote = RouterOutputs['bookings']['getCancellationQuote'];

/** What the selected option refunds (guests always get the policy refund). */
function refundFor(quote: Quote, mode: 'guest' | 'admin', refund: RefundMode) {
	if (mode === 'guest' || refund === 'policy') return quote.refundAmount;
	return refund === 'full' ? quote.amountPaid : 0;
}

/**
 * Cancel button with a confirmation dialog that shows the refund under the
 * booking's cancellation policy. Guests get the policy refund; admins choose
 * policy, full (force majeure) or no refund.
 */
export function CancelBookingButton({
	publicId,
	mode,
}: {
	publicId: string;
	mode: 'guest' | 'admin';
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState('');
	// null: the default (no refund while a payment dispute is open, else the
	// policy refund).
	const [refundChoice, setRefund] = useState<RefundMode | null>(null);
	const [confirmDisputeRefund, setConfirmDisputeRefund] = useState(false);

	const quote = useQuery({
		...trpc.bookings.getCancellationQuote.queryOptions({ publicId }),
		enabled: open,
		staleTime: 0,
	});
	const guestCancel = useMutation(
		trpc.bookings.cancelBooking.mutationOptions(),
	);
	const adminCancel = useMutation(
		trpc.bookings.adminCancelBooking.mutationOptions(),
	);
	const pending = guestCancel.isPending || adminCancel.isPending;

	const disputed = quote.data?.hasOpenDispute ?? false;
	const refund: RefundMode = refundChoice ?? (disputed ? 'none' : 'policy');
	const refundAmount = quote.data ? refundFor(quote.data, mode, refund) : 0;
	const needsDisputeConfirm =
		mode === 'admin' && disputed && refund !== 'none' && !confirmDisputeRefund;

	const handleCancel = async () => {
		try {
			const result =
				mode === 'admin'
					? await adminCancel.mutateAsync({
							publicId,
							refund,
							reason: reason || undefined,
							confirmDisputeRefund:
								disputed && refund !== 'none'
									? confirmDisputeRefund
									: undefined,
						})
					: await guestCancel.mutateAsync({
							publicId,
							reason: reason || undefined,
						});
			toast.add({
				type: 'success',
				title: 'Booking cancelled',
				description:
					result.refundAmount > 0
						? `${currency(result.refundAmount)} will be refunded to the original payment method.`
						: 'No refund was due.',
			});
			setOpen(false);
			await queryClient.invalidateQueries(trpc.bookings.pathFilter());
		} catch (error) {
			toast.add({
				type: 'error',
				title: 'Could not cancel the booking',
				description: error instanceof Error ? error.message : undefined,
			});
		}
	};

	return (
		<>
			<Button
				variant="destructive"
				className="w-full"
				onClick={() => setOpen(true)}
			>
				<Icon icon="tabler:circle-x" className="size-6" />
				Cancel Booking
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Cancel this booking?</DialogTitle>
						<DialogDescription>
							Cancelled dates become available to other guests. This cannot be
							undone.
						</DialogDescription>
					</DialogHeader>

					<QuoteDetails
						quote={quote}
						mode={mode}
						refund={refund}
						onRefundChange={setRefund}
						refundAmount={refundAmount}
						reason={reason}
						onReasonChange={setReason}
						confirmDisputeRefund={confirmDisputeRefund}
						onConfirmDisputeRefundChange={setConfirmDisputeRefund}
					/>

					<DialogFooter>
						<Button variant="outline" onClick={() => setOpen(false)}>
							Keep booking
						</Button>
						<Button
							variant="destructive"
							onClick={handleCancel}
							disabled={
								pending ||
								!quote.data ||
								needsDisputeConfirm ||
								(mode === 'guest' &&
									(!quote.data.canCancel || quote.data.hasOpenDispute))
							}
						>
							{pending ? 'Cancelling...' : 'Cancel booking'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function QuoteDetails({
	quote,
	mode,
	refund,
	onRefundChange,
	refundAmount,
	reason,
	onReasonChange,
	confirmDisputeRefund,
	onConfirmDisputeRefundChange,
}: {
	quote: UseQueryResult<Quote, { message: string }>;
	mode: 'guest' | 'admin';
	refund: RefundMode;
	onRefundChange: (refund: RefundMode) => void;
	refundAmount: number;
	reason: string;
	onReasonChange: (reason: string) => void;
	confirmDisputeRefund: boolean;
	onConfirmDisputeRefundChange: (value: boolean) => void;
}) {
	const reasonId = useId();
	const refundId = useId();
	const disputeConfirmId = useId();
	if (quote.isPending) {
		return (
			<p className="text-sm text-muted-foreground">Calculating refund...</p>
		);
	}
	if (quote.isError) {
		return <p className="text-sm text-destructive">{quote.error.message}</p>;
	}
	if (!quote.data.canCancel && mode === 'guest') {
		return (
			<p className="text-sm text-destructive">
				Check-in time has passed, so this booking can no longer be cancelled
				online. Please{' '}
				<Link to="/contact" className="underline">
					contact us
				</Link>
				.
			</p>
		);
	}
	if (quote.data.hasOpenDispute && mode === 'guest') {
		return (
			<p className="text-sm text-destructive">
				This booking's payment is under review, so it can't be cancelled online.
				Please{' '}
				<Link to="/contact" className="underline">
					contact us
				</Link>
				.
			</p>
		);
	}
	const { data } = quote;
	return (
		<div className="space-y-4 text-sm">
			{mode === 'admin' && data.hasOpenDispute && (
				<div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
					<p className="font-semibold">This payment has an open dispute.</p>
					<p>
						Refunding a disputed payment can credit the guest twice (once by the
						refund and again if the dispute is lost). The refund defaults to
						none.
					</p>
					{refund !== 'none' && (
						<label
							htmlFor={disputeConfirmId}
							className="mt-2 flex cursor-pointer items-start gap-2"
						>
							<input
								id={disputeConfirmId}
								type="checkbox"
								className="mt-1"
								checked={confirmDisputeRefund}
								onChange={(e) => onConfirmDisputeRefundChange(e.target.checked)}
							/>
							<span>I understand, refund anyway.</span>
						</label>
					)}
				</div>
			)}
			{mode === 'admin' && (
				<div className="space-y-1">
					<Label htmlFor={refundId}>Refund</Label>
					<select
						id={refundId}
						className="h-9 w-full rounded-md border border-input bg-background px-3"
						value={refund}
						onChange={(e) => onRefundChange(e.target.value as RefundMode)}
					>
						<option value="policy">
							Policy refund ({data.refundPercent}%)
						</option>
						<option value="full">Full refund (cancelled by us)</option>
						<option value="none">No refund</option>
					</select>
				</div>
			)}
			<div className="rounded-md bg-muted p-3">
				<p>
					Amount paid: <strong>{currency(data.amountPaid)}</strong>
				</p>
				<p>
					Refund: <strong>{currency(refundAmount)}</strong>
					{refund === 'policy' && data.amountPaid > 0 && (
						<span className="text-muted-foreground">
							{' '}
							({data.refundPercent}% under the {data.policy.name.toLowerCase()})
						</span>
					)}
				</p>
				<p className="mt-2 text-xs text-muted-foreground">
					Windows count from check-in at {data.policy.checkInTime} (
					{data.policy.timezone}):{' '}
					{data.policy.tiers
						.map((t) => `${t.minHoursBefore}h+ before: ${t.refundPercent}%`)
						.join(', ')}
					.{' '}
					<Link
						to="/cancellation-refund-policy"
						target="_blank"
						className="underline"
					>
						Full policy
					</Link>
				</p>
			</div>
			<div className="space-y-1">
				<Label htmlFor={reasonId}>Reason (optional)</Label>
				<Textarea
					id={reasonId}
					value={reason}
					maxLength={500}
					onChange={(e) => onReasonChange(e.target.value)}
				/>
			</div>
		</div>
	);
}
