import { Icon } from '@iconify/react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
	const theme = 'light';

	return (
		<Sonner
			theme={theme as ToasterProps['theme']}
			className="toaster group"
			icons={{
				success: (
					<Icon
						icon="tabler:circle-check-filled"
						className="size-6 text-primary"
					/>
				),
				error: (
					<Icon
						icon="tabler:circle-x-filled"
						className="size-6 text-destructive"
					/>
				),
				loading: (
					<Icon icon="tabler:loader-2" className="size-6 animate-spin" />
				),
				warning: (
					<Icon
						icon="tabler:alert-triangle-filled"
						className="size-6 text-accent"
					/>
				),
				info: (
					<Icon
						icon="tabler:alert-circle-filled"
						className="size-6 text-secondary-foreground"
					/>
				),
			}}
			style={
				{
					'--normal-bg': 'var(--secondary)',
					'--normal-text': 'var(--popover-foreground)',
					'--normal-border': 'var(--popover-foreground)',
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
