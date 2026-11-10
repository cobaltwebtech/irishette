import { Icon } from '@iconify/react';

import { Badge } from '@/components/ui/badge';
import {
	INBOX_KIND_LABELS,
	INBOX_SOURCE_LABELS,
	type InboxKind,
	type InboxSource,
} from '@/lib/inbox/inbox';
import { formatDateTimeCT } from '@/utils/timezone';
import { cn } from '@/utils/twMerge';

// Small shared pieces of the admin notification pages and panels.

const SOURCE_STYLE: Record<InboxSource, { icon: string; className: string }> = {
	stripe: {
		icon: 'tabler:brand-stripe',
		className: 'border-indigo-200 bg-indigo-50 text-indigo-800',
	},
	system: {
		icon: 'tabler:settings-exclamation',
		className: 'border-amber-200 bg-amber-50 text-amber-800',
	},
	guest: {
		icon: 'tabler:mail',
		className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
	},
};

/** The source tag (Stripe / System / Guest). */
export function InboxSourceBadge({ source }: { source: InboxSource }) {
	const style = SOURCE_STYLE[source];
	return (
		<Badge variant="outline" className={style.className}>
			<Icon icon={style.icon} className="size-3.5" />
			{INBOX_SOURCE_LABELS[source]}
		</Badge>
	);
}

export function InboxKindLabel({ kind }: { kind: InboxKind }) {
	return (
		<span className="text-xs text-muted-foreground">
			{INBOX_KIND_LABELS[kind]}
		</span>
	);
}

/** A dot for unread items (screen readers hear "Unread"). */
export function UnreadDot({ unread }: { unread: boolean }) {
	return (
		<span
			className={cn(
				'inline-block size-2 shrink-0 rounded-full',
				unread ? 'bg-primary' : 'bg-transparent',
			)}
		>
			{unread && <span className="sr-only">Unread</span>}
		</span>
	);
}

/** "Nov 8, 2026, 3:04 PM CT" (property time, same on server and client). */
export const formatInboxDate = (date: Date | string) => formatDateTimeCT(date);
