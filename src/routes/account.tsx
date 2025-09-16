import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { Calendar, CreditCard, LogOut, Settings, User } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { client, useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/account')({
	head: () => ({
		meta: [
			{
				title: 'My Account | Irishette.com',
			},
		],
	}),
	component: AccountPage,
});

function AccountPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	// Redirect if not logged in
	useEffect(() => {
		if (!isPending && !session) {
			router.navigate({ to: '/login' });
		}
	}, [session, isPending, router]);

	const handleSignOut = async () => {
		try {
			await client.signOut();
			router.navigate({ to: '/' });
		} catch (error) {
			console.error('Sign out error:', error);
		}
	};

	if (isPending) {
		return (
			<div className="min-h-screen bg-background flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
					<p className="text-muted-foreground">Loading your dashboard...</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return null; // Will redirect via useEffect
	}

	return (
		<div className="min-h-screen bg-background">
			{/* Header */}
			<div className="bg-primary/5 border-b">
				<div className="container mx-auto px-4 py-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-2xl font-bold text-foreground">
								Welcome back, {session.user.name || session.user.email}
							</h1>
							<p className="text-muted-foreground">
								Manage your bookings and account settings
							</p>
						</div>
						<Button variant="outline" onClick={handleSignOut}>
							<LogOut className="w-4 h-4 mr-2" />
							Sign Out
						</Button>
					</div>
				</div>
			</div>

			{/* Dashboard Content */}
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{/* Account Info Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<User className="w-5 h-5 mr-2" />
								Account Information
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="space-y-2">
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Email
									</p>
									<p className="text-foreground">{session.user.email}</p>
								</div>
								{session.user.name && (
									<div>
										<p className="text-sm font-medium text-muted-foreground">
											Name
										</p>
										<p className="text-foreground">{session.user.name}</p>
									</div>
								)}
								<div>
									<p className="text-sm font-medium text-muted-foreground">
										Member Since
									</p>
									<p className="text-foreground">
										{new Date(session.user.createdAt).toLocaleDateString()}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Bookings Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<Calendar className="w-5 h-5 mr-2" />
								My Bookings
							</CardTitle>
							<CardDescription>
								View and manage your upcoming stays
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-center py-4">
								<p className="text-muted-foreground mb-4">
									You have no upcoming bookings
								</p>
								<Link
									to="/"
									className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									Book a Stay
								</Link>
							</div>
						</CardContent>
					</Card>

					{/* Payment Methods Card */}
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center">
								<CreditCard className="w-5 h-5 mr-2" />
								Payment Methods
							</CardTitle>
							<CardDescription>
								Manage your saved payment methods
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="text-center py-4">
								<p className="text-muted-foreground mb-4">
									No payment methods saved
								</p>
								<Button variant="outline" size="sm">
									Add Payment Method
								</Button>
							</div>
						</CardContent>
					</Card>

					{/* Quick Actions Card */}
					<Card className="md:col-span-2 lg:col-span-3">
						<CardHeader>
							<CardTitle className="flex items-center">
								<Settings className="w-5 h-5 mr-2" />
								Quick Actions
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
								<Link
									to="/rose-room"
									className="flex items-center p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
								>
									<div>
										<p className="font-medium">Rose Room</p>
										<p className="text-sm text-muted-foreground">
											View details
										</p>
									</div>
								</Link>
								<Link
									to="/texas-room"
									className="flex items-center p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
								>
									<div>
										<p className="font-medium">Texas Room</p>
										<p className="text-sm text-muted-foreground">
											View details
										</p>
									</div>
								</Link>
								<Button className="flex items-center p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left">
									<div>
										<p className="font-medium">Update Profile</p>
										<p className="text-sm text-muted-foreground">
											Edit your information
										</p>
									</div>
								</Button>
								<Button className="flex items-center p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left">
									<div>
										<p className="font-medium">Contact Support</p>
										<p className="text-sm text-muted-foreground">Get help</p>
									</div>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
