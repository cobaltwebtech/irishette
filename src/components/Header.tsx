import { Icon } from '@iconify/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { clearSession, useSession } from '@/lib/session';
import { useBookingStore } from '@/stores';

export default function Header() {
	const session = useSession();
	const router = useRouter();
	const queryClient = useQueryClient();

	const handleLogout = async () => {
		try {
			await signOut();
		} catch (error) {
			console.error('Logout error:', error);
		}
		setIsMobileMenuOpen(false);
		// Drop the cached session and user data, re-run guards, go home.
		await clearSession(queryClient, router);
		await router.navigate({ to: '/' });
	};
	const booking = useBookingStore();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	return (
		<header className="sticky top-0 z-50 bg-linear-to-b from-secondary-foreground to-primary">
			<div className="container mx-auto px-4 py-2">
				<div className="flex h-16 items-center justify-between">
					{/* Logo/Brand */}
					<Link
						to="/"
						className="text-2xl font-extrabold text-background transition-colors hover:text-background/80"
					>
						Irishette
						<span className="sr-only">Home</span>
						<span className="block text-xs"> Logo goes here</span>
					</Link>

					{/* Navigation */}
					<nav className="hidden lg:inline">
						<ul className="flex items-center gap-x-4">
							<li>
								<Link
									key="rose-room"
									to="/rooms/rose-room"
									className="flex flex-nowrap items-center gap-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
								>
									<Icon icon="lucide:rose" className="size-5" />
									Rose Room
								</Link>
							</li>
							<li>
								<Link
									key="texas-room"
									to="/rooms/texas-room"
									className="flex flex-nowrap items-center gap-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
								>
									<Icon icon="game-icons:texas" className="size-5" />
									Texas Room
								</Link>
							</li>
							<li>
								<Link
									key="contact"
									to="/contact"
									className="flex flex-nowrap items-center gap-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
								>
									<Icon icon="tabler:message" className="size-5" />
									Contact Us
								</Link>
							</li>
						</ul>
					</nav>

					{/* Auth Section */}
					<div className="flex items-center space-x-2">
						{session ? (
							// Authenticated user menu
							<div className="flex items-center space-x-2">
								{/* Continue Booking Button - Shows if there's an active booking in progress */}
								{booking.hasActiveBooking() && (
									<Button variant="secondary" asChild>
										<Link to="/booking" search={{ step: undefined }}>
											<Icon icon="tabler:clock-check" className="size-5" />
											<span className="hidden lg:inline">Continue Booking</span>
										</Link>
									</Button>
								)}
								{/* Admin Dashboard Button - Only visible to admin users */}
								{session.user?.role === 'admin' && (
									<Button variant="destructive" asChild>
										<Link to="/admin">
											<Icon icon="tabler:shield-star" className="size-5" />
											<span className="hidden lg:inline">Admin</span>
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
								<Button className="hidden lg:flex" onClick={handleLogout}>
									<Icon icon="tabler:logout" className="size-4" />
									Logout
								</Button>
							</div>
						) : (
							// Unauthenticated user
							<>
								{/* Continue Booking Button - Shows if there's an active booking in progress */}
								{booking.hasActiveBooking() && (
									<Button variant="secondary" asChild>
										<Link to="/booking" search={{ step: undefined }}>
											<Icon icon="tabler:clock-check" className="size-5" />
											<span className="hidden lg:inline">Continue Booking</span>
										</Link>
									</Button>
								)}
								<Button variant="accent" asChild>
									<Link
										to="/auth/login"
										search={{ redirect: '/account', error: undefined }}
									>
										<Icon icon="tabler:luggage" className="size-5" />
										View Bookings
									</Link>
								</Button>
							</>
						)}

						{/* Mobile Menu Button */}
						<div className="lg:hidden">
							<Button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
								<Icon
									icon={isMobileMenuOpen ? 'tabler:x' : 'tabler:menu-4'}
									className="size-5"
								/>
							</Button>
						</div>
					</div>
				</div>

				{/* Mobile Menu Dropdown */}
				<div
					className={`overflow-hidden border-t border-background/20 transition-all duration-300 ease-in-out lg:hidden ${
						isMobileMenuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
					}`}
				>
					<div
						className={`transform transition-transform duration-300 ease-in-out ${
							isMobileMenuOpen ? 'translate-y-0' : '-translate-y-4'
						}`}
					>
						<nav className="py-4">
							<ul className="flex flex-col gap-y-4">
								<li>
									<Link
										to="/rooms/rose-room"
										className="flex items-center gap-2 px-4 py-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
										onClick={() => setIsMobileMenuOpen(false)}
									>
										<Icon icon="lucide:rose" className="size-5" />
										Rose Room
									</Link>
								</li>
								<li>
									<Link
										to="/rooms/texas-room"
										className="flex items-center gap-2 px-4 py-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
										onClick={() => setIsMobileMenuOpen(false)}
									>
										<Icon icon="game-icons:texas" className="size-5" />
										Texas Room
									</Link>
								</li>
								<li>
									<Link
										to="/contact"
										className="flex items-center gap-2 px-4 py-2 font-semibold text-background transition-colors hover:text-secondary [&.active]:text-accent"
										onClick={() => setIsMobileMenuOpen(false)}
									>
										<Icon icon="tabler:message" className="size-5" />
										Contact Us
									</Link>
								</li>
								{session && (
									<li className="flex justify-end">
										<Button variant="destructive" onClick={handleLogout}>
											<Icon icon="tabler:logout" className="size-4" />
											Logout
										</Button>
									</li>
								)}
							</ul>
						</nav>
					</div>
				</div>
			</div>
		</header>
	);
}
