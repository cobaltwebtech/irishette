import { Link, useRouter } from '@tanstack/react-router';
import { LogOut, Luggage, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { client, useSession } from '@/lib/auth-client';

const navigationLinks = [
	{ to: '/rooms/rose-room', label: 'Rose Room' },
	{ to: '/rooms/texas-room', label: 'Texas Room' },
	{ to: '/contact', label: 'Contact Us' },
];

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
						onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
					>
						Irishette
						<span className="sr-only">Home</span>
						<span className="text-xs"> Logo goes here</span>
					</Link>

					{/* Navigation */}
					<nav className="hidden md:flex items-center space-x-8">
						{navigationLinks.map((link) => (
							<Link
								key={link.to}
								to={link.to}
								className="text-foreground hover:text-primary transition-colors [&.active]:text-primary [&.active]:font-semibold"
								activeProps={{ className: 'text-primary font-semibold' }}
							>
								{link.label}
							</Link>
						))}
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
								<Button asChild>
									<Link to="/login">
										<Luggage className="size-5" />
										View Bookings
									</Link>
								</Button>
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
