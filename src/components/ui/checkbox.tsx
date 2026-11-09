import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox';
import { Icon } from '@iconify/react';

import { cn } from '@/utils/twMerge';

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				// inline-flex: the Base UI root is a <span>, which ignores size-4 when
				// inline (the Radix root was a <button>, an inline-block).
				'peer inline-flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-muted shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary',
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none"
			>
				<Icon icon="tabler:check" className="size-3.5" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
