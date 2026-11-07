import { Icon } from '@iconify/react';
import {
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';

type Feed = RouterOutputs['ical']['listFeeds'][number];
type FeedSource = Feed['source'];
type SyncResult = RouterOutputs['ical']['syncRoom'][number];

const SOURCES: Array<{ value: FeedSource; label: string }> = [
	{ value: 'airbnb', label: 'Airbnb' },
	{ value: 'expedia', label: 'Expedia' },
	{ value: 'vrbo', label: 'Vrbo' },
	{ value: 'booking', label: 'Booking.com' },
	{ value: 'other', label: 'Other' },
];
const sourceLabel = (source: string) =>
	SOURCES.find((s) => s.value === source)?.label ?? source;

const formatTime = (date: Date | null | undefined) =>
	date ? new Date(date).toLocaleString() : 'Never';

function syncSummary(results: SyncResult[]) {
	const failed = results.filter(
		(r) => r.status === 'error' || r.status === 'rejected',
	);
	const changes = results.reduce(
		(n, r) => n + r.added + r.updated + r.removed,
		0,
	);
	return { failed, changes };
}

/**
 * Admin: import feeds (Airbnb, Expedia, ... as data), the export URL with its
 * secret token, and the sync history for one room.
 */
export function RoomCalendarIntegration({ roomId }: { roomId: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: feeds } = useSuspenseQuery(
		trpc.ical.listFeeds.queryOptions({ roomId }),
	);
	const { data: exportUrl } = useSuspenseQuery(
		trpc.ical.getExportUrl.queryOptions({ roomId }),
	);
	const [editing, setEditing] = useState<Feed | 'new' | null>(null);
	const [deleting, setDeleting] = useState<Feed | null>(null);
	const [confirmRegenerate, setConfirmRegenerate] = useState(false);

	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries(trpc.ical.listFeeds.pathFilter()),
			queryClient.invalidateQueries(trpc.ical.getSyncLogs.pathFilter()),
		]);

	const syncRoom = useMutation(trpc.ical.syncRoom.mutationOptions());
	const updateFeed = useMutation(trpc.ical.updateFeed.mutationOptions());
	const deleteFeed = useMutation(trpc.ical.deleteFeed.mutationOptions());
	const regenerate = useMutation(
		trpc.ical.regenerateExportToken.mutationOptions(),
	);

	const handleSync = async (force = false) => {
		try {
			const results = await syncRoom.mutateAsync({ roomId, force });
			const { failed, changes } = syncSummary(results);
			if (results.length === 0) {
				toast.info('No active feeds to sync');
			} else if (failed.length > 0) {
				toast.error(
					`${failed.length} feed${failed.length === 1 ? '' : 's'} failed`,
					{ description: failed.map((f) => f.error).join('; ') },
				);
			} else {
				toast.success('Calendars synced', {
					description: `${changes} change${changes === 1 ? '' : 's'} applied.`,
				});
			}
		} catch (error) {
			toast.error('Sync failed', {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			await refresh();
		}
	};

	const copy = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied to clipboard');
		} catch {
			toast.error('Copy failed. Select the URL and copy it manually.');
		}
	};

	const hasRejected = feeds.some(
		(f) => f.isActive && f.lastError?.includes('events'),
	);

	return (
		<>
			<Card>
				<CardHeader className="flex flex-wrap justify-between gap-4">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Icon icon="tabler:calendar-cog" className="size-5" />
							Calendar Integrations
						</CardTitle>
						<CardDescription>
							Import reservations from other platforms (synced every 30 minutes
							and before each payment), and export this room's bookings and
							blocks to them.
						</CardDescription>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => handleSync(false)}
							disabled={syncRoom.isPending}
						>
							<Icon
								icon="tabler:refresh"
								className={syncRoom.isPending ? 'animate-spin' : undefined}
							/>
							Sync now
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setEditing('new')}
						>
							<Icon icon="tabler:plus" />
							Add feed
						</Button>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					{hasRejected && (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
							<span>
								A feed's reservations dropped sharply, so the import was not
								applied. If the change is real, apply it anyway.
							</span>
							<Button
								size="sm"
								variant="outline"
								onClick={() => handleSync(true)}
								disabled={syncRoom.isPending}
							>
								Apply anyway
							</Button>
						</div>
					)}

					{feeds.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No import feeds yet. Add the iCal export URL from Airbnb, Expedia,
							Vrbo or Booking.com.
						</p>
					) : (
						<ul className="space-y-3">
							{feeds.map((feed) => (
								<li key={feed.id} className="space-y-2 rounded-lg border p-4">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex flex-wrap items-center gap-2">
											<h5 className="font-medium">
												{feed.label || sourceLabel(feed.source)}
											</h5>
											<Badge variant="outline">
												{sourceLabel(feed.source)}
											</Badge>
											{!feed.isActive ? (
												<Badge variant="secondary">Paused</Badge>
											) : feed.lastError ? (
												<Badge variant="destructive">Error</Badge>
											) : feed.lastSuccessAt ? (
												<Badge>OK</Badge>
											) : (
												<Badge variant="secondary">Not synced yet</Badge>
											)}
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<Switch
												checked={feed.isActive}
												aria-label={
													feed.isActive ? 'Pause feed' : 'Resume feed'
												}
												onCheckedChange={async (isActive) => {
													try {
														await updateFeed.mutateAsync({
															id: feed.id,
															isActive,
														});
													} catch (error) {
														toast.error('Could not update the feed', {
															description:
																error instanceof Error
																	? error.message
																	: undefined,
														});
													}
													await refresh();
												}}
											/>
											<Button
												variant="outline"
												size="sm"
												onClick={() => setEditing(feed)}
											>
												<Icon icon="tabler:edit" />
												Edit
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onClick={() => setDeleting(feed)}
											>
												<Icon icon="tabler:trash" />
												Remove
											</Button>
										</div>
									</div>
									<p className="truncate font-mono text-xs text-muted-foreground">
										{feed.url}
									</p>
									<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
										<div>
											<dt className="text-muted-foreground">Last success</dt>
											<dd>{formatTime(feed.lastSuccessAt)}</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">Last attempt</dt>
											<dd>{formatTime(feed.lastAttemptAt)}</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">Events in feed</dt>
											<dd>{feed.lastEventCount ?? '-'}</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">
												Stored (upcoming)
											</dt>
											<dd>{feed.storedEvents}</dd>
										</div>
									</dl>
									{feed.lastError && (
										<p className="text-sm text-destructive">
											Last error: {feed.lastError}
										</p>
									)}
								</li>
							))}
						</ul>
					)}

					{/* Export */}
					<div className="space-y-3 rounded-lg border p-4">
						<h5 className="font-medium">Export calendar to other platforms</h5>
						<p className="text-sm text-muted-foreground">
							Paste this URL into Airbnb, Expedia, etc. It lists confirmed
							bookings and blocked dates as "Reserved" (no guest details). The
							URL contains a secret: share it only with those platforms.
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<code className="min-w-0 flex-1 truncate rounded border bg-muted px-2 py-1 font-mono text-xs">
								{exportUrl.url}
							</code>
							<Button
								variant="secondary"
								size="sm"
								onClick={() => copy(exportUrl.url)}
							>
								<Icon icon="tabler:copy" />
								Copy
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setConfirmRegenerate(true)}
							>
								<Icon icon="tabler:key" />
								Regenerate URL
							</Button>
						</div>
					</div>

					<SyncHistory roomId={roomId} />
				</CardContent>
			</Card>

			{editing && (
				<FeedDialog
					roomId={roomId}
					feed={editing === 'new' ? null : editing}
					onClose={() => setEditing(null)}
					onSaved={refresh}
				/>
			)}

			<Dialog
				open={!!deleting}
				onOpenChange={(open) => !open && setDeleting(null)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Remove feed?</DialogTitle>
						<DialogDescription>
							This removes the feed and the reservations imported from it. Those
							dates become bookable here again.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleting(null)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleteFeed.isPending}
							onClick={async () => {
								if (!deleting) return;
								try {
									await deleteFeed.mutateAsync({ id: deleting.id });
									toast.success('Feed removed');
									setDeleting(null);
								} catch (error) {
									toast.error('Could not remove the feed', {
										description:
											error instanceof Error ? error.message : undefined,
									});
								}
								await refresh();
							}}
						>
							Remove
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Regenerate the export URL?</DialogTitle>
						<DialogDescription>
							The current URL stops working immediately. Update it on every
							platform that imports this calendar.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmRegenerate(false)}
						>
							Cancel
						</Button>
						<Button
							disabled={regenerate.isPending}
							onClick={async () => {
								try {
									await regenerate.mutateAsync({ roomId });
									await queryClient.invalidateQueries(
										trpc.ical.getExportUrl.pathFilter(),
									);
									toast.success('New export URL created');
									setConfirmRegenerate(false);
								} catch (error) {
									toast.error('Could not regenerate the URL', {
										description:
											error instanceof Error ? error.message : undefined,
									});
								}
							}}
						>
							Regenerate
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function FeedDialog({
	roomId,
	feed,
	onClose,
	onSaved,
}: {
	roomId: string;
	feed: Feed | null;
	onClose: () => void;
	onSaved: () => Promise<unknown>;
}) {
	const trpc = useTRPC();
	const ids = { source: useId(), label: useId(), url: useId() };
	const [source, setSource] = useState<FeedSource>(feed?.source ?? 'airbnb');
	const [label, setLabel] = useState(feed?.label ?? '');
	const [url, setUrl] = useState(feed?.url ?? '');
	const [error, setError] = useState<string | null>(null);
	const createFeed = useMutation(trpc.ical.createFeed.mutationOptions());
	const updateFeed = useMutation(trpc.ical.updateFeed.mutationOptions());
	const testUrl = useMutation(trpc.ical.testUrl.mutationOptions());
	const saving = createFeed.isPending || updateFeed.isPending;

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		try {
			if (feed) {
				await updateFeed.mutateAsync({ id: feed.id, source, label, url });
			} else {
				await createFeed.mutateAsync({
					roomId,
					source,
					label,
					url,
					isActive: true,
				});
			}
			await onSaved();
			toast.success(feed ? 'Feed updated' : 'Feed added', {
				description: 'Use "Sync now" to import it right away.',
			});
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not save the feed');
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{feed ? 'Edit feed' : 'Add import feed'}</DialogTitle>
					<DialogDescription>
						Paste the calendar export (iCal) URL from the platform.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSave} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1">
							<Label htmlFor={ids.source}>Platform</Label>
							<select
								id={ids.source}
								className="h-9 w-full rounded-md border border-input bg-background px-3"
								value={source}
								onChange={(e) => setSource(e.target.value as FeedSource)}
							>
								{SOURCES.map((s) => (
									<option key={s.value} value={s.value}>
										{s.label}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-1">
							<Label htmlFor={ids.label}>Label (optional)</Label>
							<Input
								id={ids.label}
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								placeholder="e.g. Airbnb listing 123"
							/>
						</div>
					</div>
					<div className="space-y-1">
						<Label htmlFor={ids.url}>iCal URL</Label>
						<Input
							id={ids.url}
							type="url"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							placeholder="https://..."
							required
						/>
					</div>
					{testUrl.data && (
						<p
							className={`text-sm ${testUrl.data.success ? 'text-primary' : 'text-destructive'}`}
						>
							{testUrl.data.success
								? `Valid feed: ${testUrl.data.eventCount} events (${testUrl.data.reserved} reserved, ${testUrl.data.unavailable} unavailable).`
								: testUrl.data.error}
						</p>
					)}
					{error && <p className="text-sm text-destructive">{error}</p>}
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="secondary"
							disabled={!url || testUrl.isPending}
							onClick={() => testUrl.mutate({ url })}
						>
							{testUrl.isPending && (
								<Icon icon="tabler:loader-2" className="animate-spin" />
							)}
							Test URL
						</Button>
						<Button type="button" variant="outline" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? 'Saving...' : 'Save'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

const STATUS_VARIANT: Record<
	string,
	'default' | 'secondary' | 'destructive' | 'outline'
> = {
	success: 'default',
	not_modified: 'secondary',
	rejected: 'destructive',
	error: 'destructive',
};

/** Latest sync runs; a run with changes expands to list them. */
function SyncHistory({ roomId }: { roomId: string }) {
	const trpc = useTRPC();
	const { data } = useSuspenseQuery(
		trpc.ical.getSyncLogs.queryOptions({ roomId, limit: 10 }),
	);
	const [openId, setOpenId] = useState<string | null>(null);

	return (
		<div className="space-y-2">
			<h5 className="font-medium">Recent syncs</h5>
			{data.logs.length === 0 ? (
				<p className="text-sm text-muted-foreground">No syncs yet.</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{data.logs.map((log) => {
						const changes =
							log.added + log.updated + log.removed + log.conflicts;
						return (
							<li key={log.id} className="p-3 text-sm">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={STATUS_VARIANT[log.status] ?? 'outline'}>
										{log.status.replace('_', ' ')}
									</Badge>
									<span>{formatTime(log.createdAt)}</span>
									<span className="text-muted-foreground">
										{log.feedLabel || sourceLabel(log.platform)} · {log.trigger}
									</span>
									<span className="text-muted-foreground">
										+{log.added} ~{log.updated} -{log.removed}
										{log.conflicts > 0 && ` · ${log.conflicts} conflict(s)`}
									</span>
									{changes > 0 && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setOpenId(openId === log.id ? null : log.id)
											}
										>
											{openId === log.id ? 'Hide' : 'Details'}
										</Button>
									)}
								</div>
								{log.errorMessage && (
									<p className="mt-1 text-destructive">{log.errorMessage}</p>
								)}
								{openId === log.id && <SyncChanges syncLogId={log.id} />}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

function SyncChanges({ syncLogId }: { syncLogId: string }) {
	const trpc = useTRPC();
	const { data, isPending } = useQuery(
		trpc.ical.getSyncChanges.queryOptions({ syncLogId }),
	);
	if (isPending)
		return <p className="mt-2 text-muted-foreground">Loading...</p>;
	return (
		<ul className="mt-2 space-y-1">
			{data?.map(({ change, booking }) => (
				<li key={change.id} className="flex flex-wrap gap-2">
					<Badge
						variant={change.action === 'conflict' ? 'destructive' : 'outline'}
					>
						{change.action}
					</Badge>
					<span>
						{change.action === 'removed'
							? `${change.previousStartDate} to ${change.previousEndDate}`
							: `${change.startDate} to ${change.endDate}`}
						{change.action === 'updated' &&
							` (was ${change.previousStartDate} to ${change.previousEndDate})`}
					</span>
					{change.kind && (
						<span className="text-muted-foreground">{change.kind}</span>
					)}
					{booking?.publicId && (
						<a
							className="text-primary underline"
							href={`/admin/bookings/${booking.publicId}`}
						>
							{booking.confirmationId}
						</a>
					)}
				</li>
			))}
		</ul>
	);
}
