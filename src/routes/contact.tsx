import { Icon } from '@iconify/react';
import { createFileRoute } from '@tanstack/react-router';
import { type ComponentProps, type FormEvent, useId, useState } from 'react';
import { z } from 'zod';

import { AuthError } from '@/components/auth/AuthCard';
import { TurnstileField, useTurnstile } from '@/components/auth/TurnstileField';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { submitContactFn } from '@/core/functions/contact';
import type { ContactResult } from '@/lib/contact-service';
import { contactSchema } from '@/lib/contact-validation';
import { useSession } from '@/lib/session';
import {
	CHECK_IN_TIME_LABEL,
	CHECK_OUT_TIME_LABEL,
	CONTACT_EMAIL,
	CONTACT_PHONE,
	CONTACT_PHONE_HREF,
} from '@/lib/site';

export const Route = createFileRoute('/contact')({
	// ?booking=ABC123 prefills the confirmation ID ("Contact support" links).
	validateSearch: z.object({
		booking: z.string().trim().max(20).optional().catch(undefined),
	}),
	head: () => ({
		meta: [
			{
				title: 'Contact Us | Irishette.com',
			},
			{
				name: 'description',
				content:
					"Get in touch with Irishette Bed & Breakfast. We're here to help with your booking questions and travel planning.",
			},
		],
	}),
	component: ContactPage,
});

function ContactPage() {
	return (
		<div className="bg-background">
			{/* Hero Section */}
			<section className="relative flex h-[40vh] min-h-[400px] items-center justify-center overflow-hidden shadow-lg shadow-foreground/50">
				{/* Background Image - using one of the existing room images as placeholder */}
				<div
					className="absolute inset-0 bg-cover bg-center bg-no-repeat"
					style={{
						backgroundImage: `url('https://res.cloudinary.com/cobalt/image/upload/c_fill,w_1920,h_1080,q_auto,f_auto/irishette/texas-room/9abc8cd6-f843-4e67-9142-eb473adff4f5.jpg')`,
					}}
				/>

				{/* Overlay for better text readability */}
				<div className="absolute inset-0 bg-black/60" />

				{/* Content */}
				<div className="relative z-10 container mx-auto max-w-4xl px-4 text-center">
					<h1 className="mb-6 text-4xl font-black text-white md:text-6xl lg:text-7xl">
						Contact Us
					</h1>
					<p className="mx-auto mb-8 max-w-3xl text-xl font-medium text-popover italic drop-shadow-md md:text-2xl">
						We're here to help make your stay at Irishette unforgettable
					</p>
				</div>
			</section>

			{/* Contact Information & Form */}
			<section className="px-4 py-16">
				<div className="container mx-auto max-w-6xl">
					<div className="grid gap-12 lg:grid-cols-2">
						{/* Contact Information */}
						<div className="space-y-8">
							<div>
								<h2 className="mb-6 text-3xl font-bold">Get in Touch</h2>
								<p className="mb-8 text-lg leading-relaxed text-muted-foreground">
									Have questions about your stay, need help with booking, or
									want to know more about our amenities? We'd love to hear from
									you! Our team is here to ensure you have the perfect Dublin,
									Texas getaway.
								</p>
							</div>

							{/* Contact Cards */}
							<div className="space-y-6">
								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:mail"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Email Us</h3>
												<p className="mb-2 text-muted-foreground">
													For general inquiries and booking questions
												</p>
												<a
													href={`mailto:${CONTACT_EMAIL}`}
													className="font-medium text-accent hover:text-accent/80"
												>
													{CONTACT_EMAIL}
												</a>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:phone"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Call Us</h3>
												<p className="mb-2 text-muted-foreground">
													Speak directly with our friendly staff
												</p>
												<a
													href={CONTACT_PHONE_HREF}
													className="font-medium text-accent hover:text-accent/80"
												>
													{CONTACT_PHONE}
												</a>
											</div>
										</div>
									</CardContent>
								</Card>

								<Card className="border-accent/20">
									<CardContent className="p-6">
										<div className="flex items-start gap-4">
											<Icon
												icon="tabler:map-pin"
												className="mt-1 size-6 text-accent"
											/>
											<div>
												<h3 className="mb-2 text-lg font-semibold">Visit Us</h3>
												<p className="mb-2 text-muted-foreground">
													Located in historic Dublin, Texas
												</p>
												<address className="text-accent not-italic">
													123 Historic Street
													<br />
													Dublin, TX 76446
												</address>
											</div>
										</div>
									</CardContent>
								</Card>
							</div>
						</div>

						{/* Contact Form */}
						<div>
							<Card className="border-accent/20">
								<CardHeader>
									<CardTitle className="text-2xl">Send Us a Message</CardTitle>
									<CardDescription>
										Fill out the form below and we'll get back to you as soon as
										possible.
									</CardDescription>
								</CardHeader>
								<CardContent>
									<ContactForm />
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</section>

			{/* Additional Information */}
			<section className="bg-secondary px-4 py-16">
				<div className="container mx-auto max-w-4xl">
					<Card className="border-accent/20">
						<CardHeader>
							<CardTitle className="text-center text-2xl">
								Planning Your Visit?
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-8 text-center md:grid-cols-2">
								<div>
									<h3 className="mb-3 text-lg font-semibold text-accent">
										Check-in & Check-out
									</h3>
									<p className="text-muted-foreground">
										Check-in: {CHECK_IN_TIME_LABEL}
										<br />
										Check-out: {CHECK_OUT_TIME_LABEL}
									</p>
								</div>
								<div>
									<h3 className="mb-3 text-lg font-semibold text-accent">
										Cancellation Policy
									</h3>
									<p className="text-muted-foreground">
										UPDATE CANCELLATION POLICY.
										<br />
										Contact us for special circumstances.
									</p>
								</div>
							</div>
							<div className="mt-8 text-center">
								<p className="text-muted-foreground">
									For immediate assistance with existing reservations, please
									call us directly at{' '}
									<a
										href={CONTACT_PHONE_HREF}
										className="font-medium text-accent hover:text-accent/80"
									>
										{CONTACT_PHONE}
									</a>
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}

type ContactField = keyof z.infer<typeof contactSchema>;
type FieldErrors = Partial<Record<ContactField, string>>;

const RESULT_MESSAGES: Record<
	Exclude<ContactResult, { ok: true }>['reason'],
	string
> = {
	turnstile: 'The security check failed. Please try again.',
	unavailable: `We could not run the security check right now. Please try again, or email us directly at ${CONTACT_EMAIL}.`,
	send_failed: `Your message could not be sent. Please email us directly at ${CONTACT_EMAIL}.`,
};

/** Message for a thrown server function error (rate limit, network, ...). */
function thrownMessage(error: unknown) {
	if (error instanceof Error && error.message.startsWith('Too many requests')) {
		return error.message;
	}
	return `Something went wrong. Please try again, or email us directly at ${CONTACT_EMAIL}.`;
}

/**
 * The contact form: emails the admins (CONTACT_EMAIL) and shows up in the
 * admin dashboard's notifications, where they reply by email. Nothing is sent
 * to the guest. Signed-in guests get their name, email and phone prefilled.
 */
function ContactForm() {
	const session = useSession();
	const { booking } = Route.useSearch();
	const turnstile = useTurnstile();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState('');
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [sent, setSent] = useState(false);
	const user = session?.user;

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');
		const form = new FormData(event.currentTarget);
		const parsed = contactSchema.safeParse({
			name: form.get('name'),
			email: form.get('email'),
			phone: form.get('phone'),
			subject: form.get('subject'),
			message: form.get('message'),
			bookingConfirmationId: form.get('bookingConfirmationId'),
			turnstileToken: turnstile.token,
		});
		if (!parsed.success) {
			const errors: FieldErrors = {};
			for (const issue of parsed.error.issues) {
				const field = issue.path[0] as ContactField;
				errors[field] ??= issue.message;
			}
			setFieldErrors(errors);
			if (errors.turnstileToken) setError(errors.turnstileToken);
			return;
		}
		setFieldErrors({});
		setIsLoading(true);
		try {
			const result = await submitContactFn({ data: parsed.data });
			if (result.ok) setSent(true);
			else setError(RESULT_MESSAGES[result.reason]);
		} catch (submitError) {
			setError(thrownMessage(submitError));
		} finally {
			setIsLoading(false);
			// Tokens are single-use: get a fresh one for the next attempt.
			turnstile.reset();
		}
	}

	if (sent) return <ContactSent onAgain={() => setSent(false)} />;

	return (
		<form onSubmit={handleSubmit} noValidate className="space-y-6">
			<ContactInput
				name="name"
				label="Name *"
				defaultValue={user?.name ?? ''}
				autoComplete="name"
				placeholder="Your name"
				error={fieldErrors.name}
			/>
			<div className="grid gap-4 md:grid-cols-2">
				<ContactInput
					name="email"
					label="Email Address *"
					type="email"
					defaultValue={user?.email ?? ''}
					autoComplete="email"
					placeholder="your.email@example.com"
					error={fieldErrors.email}
				/>
				<ContactInput
					name="phone"
					label="Phone Number"
					type="tel"
					defaultValue={user?.phoneNumber ?? ''}
					autoComplete="tel"
					placeholder="(123) 456-7890"
					error={fieldErrors.phone}
				/>
			</div>
			<ContactInput
				name="subject"
				label="Subject *"
				placeholder="What can we help you with?"
				error={fieldErrors.subject}
			/>
			<ContactInput
				name="bookingConfirmationId"
				label="Booking Confirmation ID"
				defaultValue={booking ?? ''}
				placeholder="Optional, e.g. ABC123"
				error={fieldErrors.bookingConfirmationId}
			/>
			<ContactTextarea error={fieldErrors.message} />
			<TurnstileField widgetRef={turnstile.ref} onToken={turnstile.setToken} />
			<AuthError message={error} />
			<div className="space-y-4">
				<Button type="submit" className="w-full" size="lg" disabled={isLoading}>
					<Icon
						icon={isLoading ? 'tabler:loader-2' : 'tabler:send'}
						className={isLoading ? 'size-5 animate-spin' : 'size-5'}
					/>
					{isLoading ? 'Sending...' : 'Send Message'}
				</Button>
				<p className="text-center text-sm text-muted-foreground">
					* Required fields. We typically respond within 24 hours.
				</p>
			</div>
		</form>
	);
}

function ContactSent({ onAgain }: { onAgain: () => void }) {
	return (
		<div className="space-y-4 py-6 text-center">
			<Icon
				icon="tabler:circle-check"
				className="mx-auto size-12 text-accent"
			/>
			<output className="block space-y-2">
				<span className="block text-xl font-semibold">
					Thanks, your message is on its way
				</span>
				<span className="block text-muted-foreground">
					We'll reply by email, usually within 24 hours.
				</span>
			</output>
			<Button variant="outline" onClick={onAgain}>
				Send another message
			</Button>
		</div>
	);
}

function FieldError({ id, message }: { id: string; message?: string }) {
	if (!message) return null;
	return (
		<p id={id} className="text-sm text-destructive">
			{message}
		</p>
	);
}

function ContactInput({
	label,
	error,
	...props
}: ComponentProps<typeof Input> & {
	name: string;
	label: string;
	error?: string;
}) {
	const id = useId();
	const errorId = `${id}-error`;
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
				{...props}
			/>
			<FieldError id={errorId} message={error} />
		</div>
	);
}

function ContactTextarea({ error }: { error?: string }) {
	const id = useId();
	const errorId = `${id}-error`;
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>Message *</Label>
			<Textarea
				id={id}
				name="message"
				rows={5}
				className="min-h-30"
				placeholder="Tell us more about your inquiry..."
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? errorId : undefined}
			/>
			<FieldError id={errorId} message={error} />
		</div>
	);
}
