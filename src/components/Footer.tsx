import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';

import { CONTACT_PHONE, CONTACT_PHONE_HREF } from '@/lib/site';
import { yearCT } from '@/utils/timezone';
import { useNow } from '@/utils/use-now';

export default function Footer() {
	// Central Time, like every date on the site.
	const year = yearCT(useNow());
	return (
		<footer className="mt-auto border-t border-border bg-muted">
			<div className="container mx-auto px-4 py-8">
				<div className="grid gap-8 md:grid-cols-[2fr_1fr_1fr]">
					{/* Logo & Description */}
					<div className="space-y-4">
						<Link
							to="/"
							className="inline-block transition-opacity hover:opacity-80"
						>
							<img
								src="/icons/irishette-logo.png"
								alt="Irishette logo"
								width={384}
								height={384}
								className="size-24 rounded-full"
							/>
							<span className="sr-only">Irishette</span>
						</Link>
						<p className="text-sm leading-relaxed">
							Experience authentic Irish hospitality in the heart of Dublin,
							Texas. Our charming bed & breakfast offers uniquely themed rooms
							for an unforgettable stay.
						</p>
					</div>

					{/* Footer Menu */}
					<div className="space-y-2 text-center text-foreground md:text-right">
						<h3 className="text-lg font-semibold">Menu</h3>
						<nav className="flex flex-col space-y-2 text-sm text-muted-foreground">
							<Link to="/" className="transition-colors hover:text-accent">
								Home
							</Link>
							<Link
								to="/rooms/rose-room"
								className="transition-colors hover:text-accent"
							>
								Rose Room
							</Link>
							<Link
								to="/rooms/texas-room"
								className="transition-colors hover:text-accent"
							>
								Texas Room
							</Link>
							<Link
								to="/account"
								className="transition-colors hover:text-accent"
							>
								My Account
							</Link>
						</nav>
					</div>

					{/* Contact Information */}
					<div className="space-y-2 text-center text-foreground md:text-right">
						<h3 className="text-lg font-semibold">Contact Us</h3>
						<nav className="flex flex-col items-center space-y-2 text-sm text-muted-foreground md:items-end">
							<Link
								to="/contact"
								className="flex items-start gap-2 transition-colors hover:text-accent"
							>
								<Icon icon="tabler:mail" className="size-5" />
								Send a Message
							</Link>
							<a
								href={CONTACT_PHONE_HREF}
								className="flex items-start gap-2 transition-colors hover:text-accent"
							>
								<Icon icon="tabler:phone" className="size-5" />
								{CONTACT_PHONE}
							</a>
							<div className="flex items-start gap-2">
								<Icon icon="tabler:map-pin" className="size-5" />
								<div className="text-center md:text-right">
									<p>123 Main Street</p>
									<p>Dublin, TX 76446</p>
									<p>United States</p>
								</div>
							</div>
						</nav>
					</div>
				</div>

				{/* Bottom Bar */}
				<div className="mt-4 border-t border-accent pt-4">
					<div className="flex flex-col items-center justify-between space-y-4 md:flex-row md:space-y-0">
						<div className="text-sm text-muted-foreground">
							© {year} Irishette Bed & Breakfast. All rights reserved.
						</div>
						<div className="flex items-center space-x-6 text-sm text-muted-foreground">
							<Link
								to="/cancellation-refund-policy"
								className="transition-colors hover:text-accent"
							>
								Cancellation & Refund Policy
							</Link>
							<Link
								to="/privacy-policy"
								className="transition-colors hover:text-accent"
							>
								Privacy Policy
							</Link>
							<Link
								to="/terms-of-service"
								className="transition-colors hover:text-accent"
							>
								Terms of Service
							</Link>
						</div>
					</div>
				</div>
			</div>
		</footer>
	);
}
