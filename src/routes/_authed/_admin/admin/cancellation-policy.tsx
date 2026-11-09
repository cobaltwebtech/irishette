import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { isTRPCClientError } from '@trpc/client';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
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
import { useTRPC } from '@/integrations/trpc/react';
import type { TRPCRouter } from '@/integrations/trpc/router';
import { CHECK_IN_TIME_LABEL } from '@/lib/site';

export const Route = createFileRoute(
	'/_authed/_admin/admin/cancellation-policy',
)({
	head: () => ({
		meta: [{ title: 'Cancellation Policy | Irishette.com' }],
	}),
	loader: ({ context }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.policies.getCancellationPolicy.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.policies.listCancellationPolicies.queryOptions(),
			),
		]),
	component: CancellationPolicyPage,
});

interface TierRow {
	key: number;
	minHoursBefore: number;
	refundPercent: number;
}

let nextKey = 0;

function CancellationPolicyPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const ids = { name: useId() };
	const { data: policy } = useSuspenseQuery(
		trpc.policies.getCancellationPolicy.queryOptions(),
	);
	const { data: history } = useSuspenseQuery(
		trpc.policies.listCancellationPolicies.queryOptions(),
	);

	const [name, setName] = useState(policy.name);
	const [tiers, setTiers] = useState<TierRow[]>(() =>
		policy.tiers.map((t) => ({ ...t, key: nextKey++ })),
	);
	const [errors, setErrors] = useState<string[]>([]);

	const save = useMutation(
		trpc.policies.saveCancellationPolicy.mutationOptions(),
	);

	const updateTier = (key: number, patch: Partial<TierRow>) =>
		setTiers((rows) =>
			rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
		);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setErrors([]);
		try {
			await save.mutateAsync({
				name,
				tiers: tiers.map(({ minHoursBefore, refundPercent }) => ({
					minHoursBefore,
					refundPercent,
				})),
			});
			await queryClient.invalidateQueries(trpc.policies.pathFilter());
			toast.success('Cancellation policy saved', {
				description:
					'It applies to new bookings. Existing bookings keep theirs.',
			});
		} catch (error) {
			if (isTRPCClientError<TRPCRouter>(error) && error.data?.zodError) {
				const { formErrors, fieldErrors } = error.data.zodError;
				setErrors([
					...formErrors,
					...Object.values(
						fieldErrors as Record<string, string[] | undefined>,
					).flatMap((m) => m ?? []),
				]);
			} else {
				toast.error('Could not save the policy', {
					description: error instanceof Error ? error.message : undefined,
				});
			}
		}
	};

	const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);

	return (
		<AdminLayout title="Cancellation & Refund Policy">
			<div className="grid gap-6 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Icon icon="tabler:receipt-refund" className="size-5" />
							Refund tiers
							{policy.isDefault && <Badge variant="secondary">Default</Badge>}
						</CardTitle>
						<CardDescription>
							Guests who cancel at least the given hours before check-in get
							that share of the booking total (including taxes and fees) back.
							Windows count back from check-in at {CHECK_IN_TIME_LABEL} on the
							check-in date, on the local clock: whole days are calendar days
							(72 hours = {CHECK_IN_TIME_LABEL} three days before, also across
							daylight saving changes), and at exactly a cutoff the higher
							refund applies. Saving creates a new version for future bookings;
							existing bookings keep the policy they booked under. Keep the{' '}
							<Link to="/cancellation-refund-policy" className="underline">
								public policy page
							</Link>{' '}
							in sync.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSave} className="space-y-4">
							<div className="grid gap-4 sm:grid-cols-3">
								<div className="space-y-1">
									<Label htmlFor={ids.name}>Policy name</Label>
									<Input
										id={ids.name}
										value={name}
										onChange={(e) => setName(e.target.value)}
										required
									/>
								</div>
								<div className="space-y-1 sm:col-span-2">
									<p className="text-sm font-medium">Check-in time</p>
									<p className="text-sm text-muted-foreground">
										Windows count back from check-in at {CHECK_IN_TIME_LABEL}{' '}
										(fixed for all bookings).
									</p>
								</div>
							</div>

							<div className="space-y-2">
								{sorted.map((tier) => (
									<div
										key={tier.key}
										className="flex flex-wrap items-center gap-2"
									>
										<span className="text-sm">At least</span>
										<Input
											aria-label="Hours before check-in"
											type="number"
											min={0}
											step={1}
											className="w-24"
											value={tier.minHoursBefore}
											onChange={(e) =>
												updateTier(tier.key, {
													minHoursBefore:
														Number.parseInt(e.target.value, 10) || 0,
												})
											}
										/>
										<span className="text-sm">
											hours before check-in, refund
										</span>
										<Input
											aria-label="Refund percent"
											type="number"
											min={0}
											max={100}
											step={1}
											className="w-20"
											value={tier.refundPercent}
											onChange={(e) =>
												updateTier(tier.key, {
													refundPercent:
														Number.parseInt(e.target.value, 10) || 0,
												})
											}
										/>
										<span className="text-sm">%</span>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											aria-label="Remove tier"
											onClick={() =>
												setTiers((rows) =>
													rows.filter((r) => r.key !== tier.key),
												)
											}
										>
											<Icon icon="tabler:trash" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setTiers((rows) => [
											...rows,
											{ key: nextKey++, minHoursBefore: 0, refundPercent: 0 },
										])
									}
								>
									<Icon icon="tabler:plus" />
									Add tier
								</Button>
							</div>

							{errors.length > 0 && (
								<ul className="list-disc pl-5 text-sm text-destructive">
									{errors.map((message) => (
										<li key={message}>{message}</li>
									))}
								</ul>
							)}

							<Button type="submit" disabled={save.isPending}>
								{save.isPending ? 'Saving...' : 'Save new version'}
							</Button>
						</form>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>History</CardTitle>
						<CardDescription>Saved versions, newest first.</CardDescription>
					</CardHeader>
					<CardContent>
						{history.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Using the built-in default policy (none saved yet).
							</p>
						) : (
							<ul className="space-y-2 text-sm">
								{history.map((p) => (
									<li key={p.id} className="flex flex-wrap items-center gap-2">
										<span className="font-medium">{p.name}</span>
										{p.isActive && <Badge>Active</Badge>}
										<span className="text-muted-foreground">
											{new Date(p.createdAt).toLocaleString()}
										</span>
									</li>
								))}
							</ul>
						)}
					</CardContent>
				</Card>
			</div>
		</AdminLayout>
	);
}
