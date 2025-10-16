import { Link } from '@tanstack/react-router';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function Footer() {
	return (
		<footer className="bg-muted border-t border-border mt-auto">
			<div className="container mx-auto px-4 py-12">
				<div className="grid md:grid-cols-[50%_auto_auto] gap-8">
					{/* Logo & Description */}
					<div className="space-y-4">
						<Link
							to="/"
							className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors inline-block"
						>
							Irishette
						</Link>
						<p className="leading-relaxed">
							Experience authentic Irish hospitality in the heart of Dublin,
							Texas. Our charming bed & breakfast offers uniquely themed rooms
							for an unforgettable stay.
						</p>
					</div>

					{/* Quick Links */}
					<div className="space-y-4 text-right text-foreground">
						<h3 className="text-lg font-semibold">Quick Links</h3>
						<nav className="flex flex-col space-y-3">
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
								View Bookings
							</Link>
						</nav>
					</div>

					{/* Contact Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold text-foreground text-right">
							Contact Us
						</h3>
						<div className="space-y-3 flex flex-col items-end">
							<div className="flex items-start gap-2">
								<MapPin className="w-5 h-5 text-primary mt-0.5 shrink-0" />
								<div className="text-right">
									<p>123 Main Street</p>
									<p>Dublin, TX 76446</p>
									<p>United States</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Phone className="w-5 h-5 text-primary shrink-0" />
								<a
									href="tel:+1234567890"
									className="hover:text-accent transition-colors"
								>
									(123) 456-7890
								</a>
							</div>
							<div className="flex items-center gap-2">
								<Mail className="w-5 h-5 text-primary shrink-0" />
								<a
									href="mailto:info@irishette.com"
									className="hover:text-accent transition-colors"
								>
									info@irishette.com
								</a>
							</div>
						</div>
					</div>
				</div>

				{/* Bottom Bar */}
				<div className="border-t border-accent mt-8 pt-8">
					<div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
						<div className="text-sm text-muted-foreground">
							© {new Date().getFullYear()} Irishette Bed & Breakfast. All rights
							reserved.
						</div>
						<div className="flex items-center space-x-6 text-sm">
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
