import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function NotFound() {
	return (
		<div className="flex flex-col flex-auto items-center justify-center px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader>
					<div className="mx-auto flex items-center justify-center size-20 rounded-full bg-destructive/40">
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
					<div className="flex flex-col items-center text-center space-y-6">
						<p className="text-muted-foreground">
							The page you're looking for doesn't exist or has been moved.
						</p>
						<div className="w-full flex flex-wrap gap-4">
							<Button
								variant="outline"
								size="lg"
								className="flex-1"
								onClick={() => window.history.back()}
							>
								← Go Back
							</Button>
							<Button asChild size="lg" className="flex-1">
								<Link to="/">
									<Icon icon="tabler:home" className="size-5" />
									Go Home
								</Link>
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
