import { Link, useRouter } from '@tanstack/react-router';
import { LogOut, Luggage, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from '@/lib/auth-client';

const navigationLinks = [
	{ to: '/rooms/rose-room', label: 'Rose Room' },
	{ to: '/rooms/texas-room', label: 'Texas Room' },
	{ to: '/contact', label: 'Contact Us' },
];

export default function Header() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	return (
		<header className="bg-gradient-to-b from-secondary-foreground to-primary sticky top-0 z-50">
			<div className="container mx-auto px-4 py-2">
				<div className="flex items-center justify-between h-16">
					{/* Logo/Brand */}
					<Link
						to="/"
						className="text-2xl font-extrabold text-background hover:text-background/80 transition-colors"
						onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
					>
						Irishette
						<span className="sr-only">Home</span>
						<span className="text-xs block"> Logo goes here</span>
					</Link>

					{/* Navigation */}
					<nav className="hidden md:flex items-center space-x-8">
						{navigationLinks.map((link) => (
							<Link
								key={link.to}
								to={link.to}
								className="text-background hover:text-secondary transition-colors font-semibold [&.active]:text-accent"
							>
								{link.label}
							</Link>
						))}
					</nav>

					{/* Auth Section */}
					<div className="flex items-center space-x-4">
						{isPending ? (
							// Loading state
							<div className="text-background">Loading...</div>
						) : session ? (
							// Authenticated user menu
							<div className="flex items-center space-x-4">
								<Button variant="accent" asChild>
									<Link to="/account">
										<User className="size-5" />
										<span className="hidden sm:inline">View Bookings</span>
									</Link>
								</Button>
								<Button
									onClick={async () => {
										try {
											await signOut();
											router.navigate({ to: '/' });
										} catch (error) {
											console.error('Logout error:', error);
										}
									}}
									variant="outline"
									className="text-background"
								>
									<LogOut className="w-4 h-4" />
									<span className="hidden sm:inline">Logout</span>
								</Button>
							</div>
						) : (
							// Unauthenticated user - always show this if not pending and no session
							<Button variant="accent" asChild>
								<Link to="/login">
									<Luggage className="size-5" />
									View Bookings
								</Link>
							</Button>
						)}

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
