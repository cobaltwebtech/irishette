import { Icon } from '@iconify/react';
import type { ErrorComponentProps } from '@tanstack/react-router';
import { Link, rootRouteId, useMatch, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';

export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
	const router = useRouter();
	const isRoot = useMatch({
		strict: false,
		select: (state) => state.id === rootRouteId,
	});
	const [showDetails, setShowDetails] = useState(false);

	console.error(error);

	// Format error details for display
	const errorMessage = error?.message || 'An unexpected error occurred';
	const errorStack = error?.stack || '';
	const hasStack = errorStack.length > 0;

	return (
		<div className="flex flex-col flex-auto items-center justify-center p-4">
			<Card className="w-full max-w-2xl">
				<CardHeader>
					<div className="flex items-center space-x-2">
						<div className="flex items-center justify-center size-12 rounded-full bg-destructive/30">
							<Icon
								icon="tabler:alert-octagon-filled"
								className="size-7 text-destructive"
							/>
						</div>
						<div>
							<CardTitle className="text-xl">
								Oh no! Something went wrong
							</CardTitle>
							<p className="text-sm text-muted-foreground">
								We encountered an unexpected error. Please try again.
							</p>
						</div>
					</div>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* Error Alert */}
					<Alert variant="destructive">
						<Icon icon="tabler:alert-triangle" className="size-5" />
						<AlertDescription className="font-medium">
							{errorMessage}
						</AlertDescription>
					</Alert>

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-4">
						<Button onClick={() => router.invalidate()} variant="secondary">
							<Icon icon="tabler:refresh" />
							Try Again
						</Button>

						{isRoot ? (
							<Button asChild>
								<Link to="/">
									<Icon icon="tabler:home" />
									Go to Home
								</Link>
							</Button>
						) : (
							<Button variant="outline" onClick={() => window.history.back()}>
								← Go Back
							</Button>
						)}
					</div>

					{/* Error Details (Collapsible) */}
					{hasStack && (
						<Collapsible open={showDetails} onOpenChange={setShowDetails}>
							<CollapsibleTrigger asChild>
								<Button variant="link" size="sm">
									<Icon icon="tabler:bug" />
									Technical Details
									<Icon
										icon="tabler:chevron-down"
										className={`size-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`}
									/>
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent className="space-y-2">
								<div className="rounded-lg bg-destructive/20 p-4">
									<h4 className="text-sm font-medium mb-2">
										Error Stack Trace:
									</h4>
									<pre className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word max-h-40 overflow-y-auto">
										{errorStack}
									</pre>
								</div>
							</CollapsibleContent>
						</Collapsible>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
