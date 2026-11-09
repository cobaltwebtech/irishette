import { AuthLinkEmail, type AuthLinkEmailProps } from './AuthLinkEmail';

export function MagicLinkEmail(props: AuthLinkEmailProps) {
	return (
		<AuthLinkEmail
			{...props}
			preview="Login to Irishette"
			title="Your Magic Link to Login"
			message="Click the link below to login to your account."
			buttonLabel="Login to Irishette"
		/>
	);
}
