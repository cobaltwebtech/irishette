import { Icon } from '@iconify/react';
import { Link, useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { signOut, useSession } from '@/lib/auth-client';

export default function Header() {
	const { data: session, isPending } = useSession();
	const router = useRouter();

	return (
		<header className="bg-linear-to-b from-secondary-foreground to-primary sticky top-0 z-50">
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
					<nav className="hidden md:block">
						<ul className="flex items-center gap-x-8">
							<li>
								<Link
									key="rose-room"
									to="/rooms/rose-room"
									className="flex items-center gap-2 text-background hover:text-secondary transition-colors font-semibold [&.active]:text-accent"
								>
									<Icon icon="lucide:rose" className="size-5" />
									Rose Room
								</Link>
							</li>
							<li>
								<Link
									key="texas-room"
									to="/rooms/texas-room"
									className="flex items-center gap-2 text-background hover:text-secondary transition-colors font-semibold [&.active]:text-accent"
								>
									<Icon icon="game-icons:texas" className="size-5" />
									Texas Room
								</Link>
							</li>
							<li>
								<Link
									key="contact"
									to="/contact"
									className="flex items-center gap-2 text-background hover:text-secondary transition-colors font-semibold [&.active]:text-accent"
								>
									<Icon icon="tabler:message" className="size-5" />
									Contact Us
								</Link>
							</li>
						</ul>
					</nav>

					{/* Auth Section */}
					<div className="flex items-center space-x-4">
						{isPending ? (
							// Loading state
							<div className="text-background">Loading...</div>
						) : session ? (
							// Authenticated user menu
							<div className="flex items-center space-x-4">
								{/* Admin Dashboard Button - Only visible to admin users */}
								{session.user?.role === 'admin' && (
									<Button variant="destructive" asChild>
										<Link to="/admin">
											<Icon icon="tabler:shield-star" className="size-5" />
											<span className="hidden sm:inline">Admin</span>
										</Link>
									</Button>
								)}
								{/* View Bookings Button - Hidden for admin users */}
								{session.user?.role !== 'admin' && (
									<Button variant="accent" asChild>
										<Link to="/account">
											<Icon
												icon="material-symbols:bed-outline-rounded"
												className="size-5"
											/>
											<span className="hidden sm:inline">View Bookings</span>
										</Link>
									</Button>
								)}
								<Button
									onClick={async () => {
										try {
											await signOut();
											router.navigate({ to: '/' });
										} catch (error) {
											console.error('Logout error:', error);
										}
									}}
									className="text-background"
								>
									<Icon icon="tabler:logout" className="size-4" />
									<span className="hidden sm:inline">Logout</span>
								</Button>
							</div>
						) : (
							// Unauthenticated user - always show this if not pending and no session
							<Button variant="accent" asChild>
								<Link to="/auth/login">
									<Icon icon="tabler:luggage" className="size-5" />
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
