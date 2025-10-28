import { Icon } from '@iconify/react';
import { Link } from '@tanstack/react-router';

export default function Footer() {
	return (
		<footer className="bg-muted border-t border-border mt-auto">
			<div className="container mx-auto px-4 py-8">
				<div className="grid md:grid-cols-[50%_auto_auto] gap-8">
					{/* Logo & Description */}
					<div className="space-y-4">
						<Link
							to="/"
							className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors inline-block"
						>
							Irishette (Logo goes here)
						</Link>
						<p className="leading-relaxed text-sm">
							Experience authentic Irish hospitality in the heart of Dublin,
							Texas. Our charming bed & breakfast offers uniquely themed rooms
							for an unforgettable stay.
						</p>
					</div>

					{/* Footer Menu */}
					<div className="space-y-2 text-center md:text-right text-foreground">
						<h3 className="text-lg font-semibold">Menu</h3>
						<nav className="flex flex-col space-y-2 text-sm text-muted-foreground">
							<Link to="/" className="hover:text-accent transition-colors">
								Home
							</Link>
							<Link
								to="/rooms/rose-room"
								className="hover:text-accent transition-colors"
							>
								Rose Room
							</Link>
							<Link
								to="/rooms/texas-room"
								className="hover:text-accent transition-colors"
							>
								Texas Room
							</Link>
							<Link
								to="/account"
								className="hover:text-accent transition-colors"
							>
								My Account
							</Link>
						</nav>
					</div>

					{/* Contact Information */}
					<div className="space-y-2 text-center md:text-right text-foreground">
						<h3 className="text-lg font-semibold">Contact Us</h3>
						<nav className="flex flex-col items-center md:items-end space-y-2 text-sm text-muted-foreground">
							<Link
								to="/contact"
								className="flex items-start gap-2 hover:text-accent transition-colors"
							>
								<Icon icon="tabler:mail" className="size-5" />
								Send a Message
							</Link>
							<a
								href="tel:+1234567890"
								className="flex items-start gap-2 hover:text-accent transition-colors"
							>
								<Icon icon="tabler:phone" className="size-5" />
								(123) 456-7890
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
				<div className="border-t border-accent mt-4 pt-4">
					<div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
						<div className="text-sm text-muted-foreground">
							© {new Date().getFullYear()} Irishette Bed & Breakfast. All rights
							reserved.
						</div>
						<div className="flex items-center space-x-6 text-sm text-muted-foreground">
							<Link
								to="/cancellation-refund-policy"
								className="hover:text-accent transition-colors"
							>
								Cancellation & Refund Policy
							</Link>
							<Link
								to="/privacy-policy"
								className="hover:text-accent transition-colors"
							>
								Privacy Policy
							</Link>
							<Link
								to="/terms-of-service"
								className="hover:text-accent transition-colors"
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
