import { Icon } from '@iconify/react';

import { HOUSE_RULES, PARKING_NOTE } from '@/lib/site';
import { cn } from '@/utils/twMerge';

const RULE_ICONS: Record<(typeof HOUSE_RULES)[number], string> = {
	'No pets': 'tabler:paw-off',
	'No smoking': 'tabler:smoking-no',
};

/**
 * Parking and house rules (src/lib/site.ts), shown before booking so nothing
 * comes as a surprise: free on-site parking, no pets, no smoking.
 */
export function PropertyNotes({ className }: { className?: string }) {
	return (
		<ul
			className={cn(
				'flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm',
				className,
			)}
		>
			<li className="flex items-center gap-2">
				<Icon icon="tabler:parking" className="size-5 text-primary" />
				{PARKING_NOTE}
			</li>
			{HOUSE_RULES.map((rule) => (
				<li key={rule} className="flex items-center gap-2">
					<Icon icon={RULE_ICONS[rule]} className="size-5 text-destructive" />
					{rule}
				</li>
			))}
		</ul>
	);
}
