import { Icon } from '@iconify/react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';

export const Route = createFileRoute('/auth/signup')({
	head: () => ({
		meta: [
			{
				title: 'Sign Up for New Account | Irishette.com',
			},
		],
	}),
	component: SignupPage,
});

function SignupPage() {
	const [status, setStatus] = useState<'loading' | 'success'>('loading');

	return (
		<div className="flex flex-col flex-auto items-center justify-center bg-background px-4 py-8">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<div className="flex items-center justify-center mx-auto size-16 bg-primary rounded-full mb-4">
						<Icon
							icon="tabler:user-plus"
							className="size-10 text-primary-foreground"
						/>
					</div>
					<CardTitle className="text-2xl font-bold">
						Sign Up for New Account
					</CardTitle>
				</CardHeader>
				<CardContent className="text-center">
					<p className="text-muted-foreground mb-6">
						Create new input fields for signup.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
