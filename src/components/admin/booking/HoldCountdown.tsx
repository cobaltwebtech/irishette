import { Icon } from '@iconify/react';
import { useEffect, useEffectEvent, useState } from 'react';

import { cn } from '@/utils/twMerge';

// The admin's hold on the dates while a payment is taken by phone (plan 06,
// ADMIN_HOLD_MINUTES): a ticking countdown, and one call when it runs out.

const secondsUntil = (end: Date) =>
	Math.max(0, Math.ceil((end.getTime() - Date.now()) / 1000));

/** Seconds left until `expiresAt`, ticking; calls `onExpire` once at zero. */
export function useHoldCountdown(expiresAt: Date, onExpire: () => void) {
	const [left, setLeft] = useState(() => secondsUntil(expiresAt));
	const expire = useEffectEvent(onExpire);
	useEffect(() => {
		let fired = false;
		const id = setInterval(() => {
			const seconds = secondsUntil(expiresAt);
			setLeft(seconds);
			if (seconds === 0 && !fired) {
				fired = true;
				clearInterval(id);
				expire();
			}
		}, 1000);
		return () => clearInterval(id);
	}, [expiresAt]);
	return left;
}

const clock = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function HoldCountdownNotice({
	seconds,
	className,
}: {
	seconds: number;
	className?: string;
}) {
	return (
		<p
			role="timer"
			aria-live="off"
			className={cn(
				'flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
				className,
			)}
		>
			<Icon icon="tabler:clock-hour-4" className="size-5 shrink-0" />
			<span>
				The dates are held for{' '}
				<strong className="tabular-nums">{clock(seconds)}</strong>. If the
				payment is not taken by then, the hold is released and the booking
				starts over.
			</span>
		</p>
	);
}
