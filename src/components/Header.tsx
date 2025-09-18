import { Link, useRouter } from '@tanstack/react-router';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { client, useSession } from '@/lib/auth-client';

export default function Header() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	return (
		<header className="bg-background border-b border-border sticky top-0 z-50">
			<div className="container mx-auto px-4">
				<div className="flex items-center justify-between h-16">
					{/* Logo/Brand */}
					<Link
						to="/"
						className="text-xl font-bold text-primary hover:text-primary/80 transition-colors"
					>
						Irishette
					</Link>

					{/* Navigation */}
					<nav className="hidden md:flex items-center space-x-8">
						<Link
							to="/"
							className="text-foreground hover:text-primary transition-colors [&.active]:text-primary [&.active]:font-semibold"
							activeProps={{ className: 'text-primary font-semibold' }}
						>
							Home
						</Link>
						<Link
							to="/rooms/rose-room"
							className="text-foreground hover:text-primary transition-colors [&.active]:text-primary [&.active]:font-semibold"
							activeProps={{ className: 'text-primary font-semibold' }}
						>
							Rose Room
						</Link>
						<Link
							to="/rooms/texas-room"
							className="text-foreground hover:text-primary transition-colors [&.active]:text-primary [&.active]:font-semibold"
							activeProps={{ className: 'text-primary font-semibold' }}
						>
							Texas Room
						</Link>
					</nav>

					{/* Auth Section */}
					<div className="flex items-center space-x-4">
						{!isPending &&
							(session ? (
								// Authenticated user menu
								<div className="flex items-center space-x-4">
									<Link
										to="/account"
										className="flex items-center space-x-2 text-foreground hover:text-primary transition-colors"
									>
										<User className="w-4 h-4" />
										<span className="hidden sm:inline">
											{session.user.name || session.user.email.split('@')[0]}
										</span>
									</Link>
									<Button
										onClick={async () => {
											try {
												await client.signOut();
												router.navigate({ to: '/' });
											} catch (error) {
												console.error('Sign out error:', error);
											}
										}}
										className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition-colors"
									>
										<LogOut className="w-4 h-4" />
										<span className="hidden sm:inline">Sign Out</span>
									</Button>
								</div>
							) : (
								// Unauthenticated user
								<Link
									to="/login"
									className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									Sign In
								</Link>
							))}

						{/* Mobile Menu Button */}
						<div className="md:hidden">
							<Button className="text-foreground hover:text-primary">
								<svg
									className="w-6 h-6"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<title>Open menu</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M4 6h16M4 12h16M4 18h16"
									/>
								</svg>
							</Button>
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
