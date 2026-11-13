import { Icon } from '@iconify/react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { signOut } from '@/lib/auth/auth-client';
import { clearSession, useSession } from '@/lib/auth/session';
import { LOGO_PATH } from '@/lib/site';
import { useBookingStore } from '@/stores';
import { cn } from '@/utils/twMerge';

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
		<header className="sticky top-0 z-50 bg-linear-to-b from-secondary-foreground to-primary print:hidden">
			<div className="container mx-auto px-4 py-2">
				<div className="flex items-center justify-between">
					{/* Logo/Brand */}
					<Link
						to="/"
						className="flex items-center transition-opacity hover:opacity-80"
					>
						<img
							src={LOGO_PATH}
							alt="Irishette logo"
							width={384}
							height={384}
							className="size-28 rounded-full"
						/>
						<span className="sr-only">Irishette</span>
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
									<Link
										to="/booking"
										search={{ step: undefined }}
										data-slot="button"
										className={cn(buttonVariants({ variant: 'secondary' }))}
									>
										<Icon icon="tabler:clock-check" className="size-5" />
										<span className="hidden lg:inline">Continue Booking</span>
									</Link>
								)}
								{/* Admin Dashboard Button - Only visible to admin users */}
								{session.user?.role === 'admin' && (
									<Link
										to="/admin"
										data-slot="button"
										className={cn(buttonVariants({ variant: 'destructive' }))}
									>
										<Icon icon="tabler:shield-star" className="size-5" />
										<span className="hidden lg:inline">Admin</span>
									</Link>
								)}
								{/* View Bookings Button - Hidden for admin users */}
								{session.user?.role !== 'admin' && (
									<Link
										to="/account"
										data-slot="button"
										className={cn(buttonVariants({ variant: 'accent' }))}
									>
										<Icon
											icon="material-symbols:bed-outline-rounded"
											className="size-5"
										/>
										<span className="hidden sm:inline">View Your Bookings</span>
									</Link>
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
									<Link
										to="/booking"
										search={{ step: undefined }}
										data-slot="button"
										className={cn(buttonVariants({ variant: 'secondary' }))}
									>
										<Icon icon="tabler:clock-check" className="size-5" />
										<span className="hidden lg:inline">Continue Booking</span>
									</Link>
								)}
								<Link
									to="/auth/login"
									search={{ redirect: '/account', error: undefined }}
									data-slot="button"
									className={cn(buttonVariants({ variant: 'accent' }))}
								>
									<Icon icon="tabler:luggage" className="size-5" />
									View Your Bookings
								</Link>
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
