import { Link } from '@tanstack/react-router';
import { Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

export default function NotFoundPage() {
	return (
		<div className="min-h-screen bg-background flex items-center justify-center px-4">
			<div className="container mx-auto max-w-2xl text-center">
				{/* 404 Hero */}
				<div className="mb-8">
					<h1 className="text-8xl md:text-9xl font-bold text-primary/50 mb-4">
						404
					</h1>
					<h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
						Page Not Found
					</h2>
					<p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
						Sorry, we couldn't find the page you're looking for. It might have
						been moved, deleted, or you entered the wrong URL.
					</p>
				</div>

				{/* Action Card */}
				<Card className="border-border shadow-lg">
					<CardHeader>
						<CardTitle className="text-xl text-foreground flex items-center justify-center gap-2">
							<Search className="w-5 h-5" />
							What can we help you find?
						</CardTitle>
						<CardDescription>
							Here are some helpful links to get you back on track
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{/* Main Actions */}
						<div className="flex flex-col sm:flex-row gap-4 justify-center">
							<Button asChild className="flex items-center gap-2">
								<Link to="/">
									<Home className="w-4 h-4" />
									Go Home
								</Link>
							</Button>
							<Button
								asChild
								variant="outline"
								className="flex items-center gap-2"
							>
								<Link to="/rooms/rose-room">View Rose Room</Link>
							</Button>
							<Button
								asChild
								variant="outline"
								className="flex items-center gap-2"
							>
								<Link to="/rooms/texas-room">View Texas Room</Link>
							</Button>
						</div>

						{/* Quick Links */}
						<div className="pt-6 border-t border-border">
							<h3 className="text-sm font-medium text-muted-foreground mb-3">
								Quick Links
							</h3>
							<div className="grid grid-cols-2 gap-2 text-sm">
								<Link
									to="/"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									Home
								</Link>
								<Link
									to="/booking"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									Book Now
								</Link>
								<Link
									to="/account"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									My Account
								</Link>
								<Link
									to="/login"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									View Bookings
								</Link>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
