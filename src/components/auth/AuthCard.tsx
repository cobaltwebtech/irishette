import { Icon } from '@iconify/react';
import type { ReactNode } from 'react';

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

/** Page shell shared by the auth pages: centered card with an icon header. */
export function AuthCard({
	icon,
	title,
	description,
	children,
	footer,
}: {
	icon: string;
	title: string;
	description?: ReactNode;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="flex flex-auto flex-col items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary">
						<Icon icon={icon} className="size-10 text-primary-foreground" />
					</div>
					<CardTitle className="text-2xl font-bold">
						<h1>{title}</h1>
					</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent className="space-y-4">{children}</CardContent>
				{footer && (
					<CardFooter className="flex justify-center text-center text-sm">
						{footer}
					</CardFooter>
				)}
			</Card>
		</div>
	);
}

/** Inline form error (announced by screen readers). */
export function AuthError({ message }: { message: string }) {
	if (!message) return null;
	return (
		<div
			role="alert"
			className="inline-flex gap-1 text-sm font-bold text-destructive"
		>
			<Icon icon="tabler:circle-x" className="size-5 shrink-0" />
			{message}
		</div>
	);
}

/** "or" divider between the primary and the alternative sign-in method. */
export function AuthDivider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-2">
			<hr className="flex-1" />
			<span className="text-xs text-muted-foreground uppercase">{label}</span>
			<hr className="flex-1" />
		</div>
	);
}
