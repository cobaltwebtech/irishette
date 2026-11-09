import { AuthLinkEmail, type AuthLinkEmailProps } from './AuthLinkEmail';

export function PasswordReset(props: AuthLinkEmailProps) {
	return (
		<AuthLinkEmail
			{...props}
			preview="Reset Password to Irishette"
			title="Reset Your Account Password"
			message="Click the link below to reset the password to your account."
			buttonLabel="Reset Password"
		/>
	);
}
