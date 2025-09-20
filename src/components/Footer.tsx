import { Link } from '@tanstack/react-router';
import { Mail, MapPin, Phone } from 'lucide-react';

export default function Footer() {
	return (
		<footer className="bg-background border-t border-border mt-auto">
			<div className="container mx-auto px-4 py-12">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					{/* Logo & Description */}
					<div className="space-y-4">
						<Link
							to="/"
							className="text-2xl font-bold text-primary hover:text-primary/80 transition-colors inline-block"
						>
							Irishette
						</Link>
						<p className="text-muted-foreground leading-relaxed">
							Experience authentic Irish hospitality in the heart of Dublin,
							Texas. Our charming bed & breakfast offers uniquely themed rooms
							for an unforgettable stay.
						</p>
					</div>

					{/* Quick Links */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold text-foreground">
							Quick Links
						</h3>
						<nav className="flex flex-col space-y-3">
							<Link
								to="/"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Home
							</Link>
							<Link
								to="/rooms/rose-room"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Rose Room
							</Link>
							<Link
								to="/rooms/texas-room"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Texas Room
							</Link>
							<Link
								to="/account"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								View Bookings
							</Link>
						</nav>
					</div>

					{/* Contact Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold text-foreground">
							Contact Us
						</h3>
						<div className="space-y-3">
							<div className="flex items-start space-x-3">
								<MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
								<div className="text-muted-foreground">
									<p>123 Main Street</p>
									<p>Dublin, TX 76446</p>
									<p>United States</p>
								</div>
							</div>
							<div className="flex items-center space-x-3">
								<Phone className="w-5 h-5 text-primary flex-shrink-0" />
								<a
									href="tel:+1234567890"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									(123) 456-7890
								</a>
							</div>
							<div className="flex items-center space-x-3">
								<Mail className="w-5 h-5 text-primary flex-shrink-0" />
								<a
									href="mailto:info@irishette.com"
									className="text-muted-foreground hover:text-primary transition-colors"
								>
									info@irishette.com
								</a>
							</div>
						</div>
					</div>
				</div>

				{/* Bottom Bar */}
				<div className="border-t border-border mt-8 pt-8">
					<div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
						<div className="text-sm text-muted-foreground">
							© {new Date().getFullYear()} Irishette Bed & Breakfast. All rights
							reserved.
						</div>
						<div className="flex items-center space-x-6 text-sm">
							<a
								href="/privacy"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Privacy Policy
							</a>
							<a
								href="/terms"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Terms of Service
							</a>
							<a
								href="/accessibility"
								className="text-muted-foreground hover:text-primary transition-colors"
							>
								Accessibility
							</a>
						</div>
					</div>
				</div>
			</div>
		</footer>
	);
}
