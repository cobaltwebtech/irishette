import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/utils/twMerge';

export function NotFound() {
	return (
		<div className="flex flex-auto flex-col items-center justify-center px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="mx-auto flex size-20 items-center justify-center rounded-full bg-destructive/40">
						<Icon
							icon="tabler:notes-off"
							className="size-12 text-destructive"
						/>
					</div>
					<CardTitle className="text-center text-2xl font-bold">
						Page Not Found
					</CardTitle>
				</CardHeader>
				<CardContent className="pt-6">
					<div className="flex flex-col items-center space-y-6 text-center">
						<p className="text-muted-foreground">
							The page you're looking for doesn't exist or has been moved.
						</p>
						<div className="flex w-full flex-wrap gap-4">
							<Button
								variant="outline"
								size="lg"
								className="flex-1"
								onClick={() => window.history.back()}
							>
								← Go Back
							</Button>
							<Link
								to="/"
								data-slot="button"
								className={cn(buttonVariants({ size: 'lg' }), 'flex-1')}
							>
								<Icon icon="tabler:home" className="size-5" />
								Go Home
							</Link>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
