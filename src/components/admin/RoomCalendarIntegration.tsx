import { Icon } from '@iconify/react';
import { useMutation } from '@tanstack/react-query';
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
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpcClient } from '@/integrations/tanstack-query/root-provider';

// Types
type CalendarProvider = 'airbnb' | 'expedia';

type TestResult = {
	success: boolean;
	error?: string;
	eventCount?: number;
	nextEvent?: {
		summary: string;
		start: string;
		end: string;
	};
};

interface RoomData {
	id: string;
	airbnbIcalUrl?: string | null;
	expediaIcalUrl?: string | null;
	lastAirbnbSync?: Date | null;
	lastExpediaSync?: Date | null;
}

interface RoomCalendarIntegrationProps {
	room: RoomData;
	onRoomUpdate: () => void;
}

export function RoomCalendarIntegration({
	room,
	onRoomUpdate,
}: RoomCalendarIntegrationProps) {
	const icalUrlId = useId();

	// Calendar management state
	const [editingCalendar, setEditingCalendar] = useState<{
		provider: CalendarProvider;
	} | null>(null);
	const [newIcalUrl, setNewIcalUrl] = useState('');
	const [testingUrl, setTestingUrl] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<TestResult | null>(null);

	// Copy to clipboard helper function
	const copyToClipboard = async (text: string, description: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success('Copied to clipboard!', {
				description: `${description} has been copied to your clipboard.`,
				duration: 2000,
			});
		} catch (error) {
			console.error('Failed to copy:', error);
			toast.error('Failed to copy to clipboard', {
				description: 'Please manually copy the URL.',
				duration: 3000,
			});
		}
	};

	// Calendar management functions
	const handleEditCalendar = (provider: CalendarProvider) => {
		setEditingCalendar({ provider });
		setNewIcalUrl(
			provider === 'airbnb'
				? room.airbnbIcalUrl || ''
				: room.expediaIcalUrl || '',
		);
	};

	const handleSaveIcalUrl = async () => {
		if (!editingCalendar) return;

		try {
			await trpcClient.rooms.updateIcalUrls.mutate({
				roomId: room.id,
				airbnbIcalUrl:
					editingCalendar.provider === 'airbnb' ? newIcalUrl : undefined,
				expediaIcalUrl:
					editingCalendar.provider === 'expedia' ? newIcalUrl : undefined,
			});

			onRoomUpdate();
			setEditingCalendar(null);
			setNewIcalUrl('');
			toast.success('iCal URL saved successfully!', {
				description: `${editingCalendar.provider === 'airbnb' ? 'AirBnB' : 'Expedia'} calendar integration has been configured.`,
				duration: 4000,
			});
		} catch (error) {
			console.error('Failed to save iCal URL:', error);
			toast.error('Failed to save iCal URL', {
				description:
					error instanceof Error
						? error.message
						: 'An unexpected error occurred.',
				duration: 5000,
			});
		}
	};

	// Test iCal URL mutation
	const testIcalUrlMutation = useMutation({
		mutationFn: (url: string) => trpcClient.rooms.testIcalUrl.mutate({ url }),
		onSuccess: (data) => {
			setTestResult(data || { success: true, error: undefined });
		},
		onError: (error) => {
			setTestResult({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		},
		onSettled: () => {
			setTestingUrl(null);
		},
	});

	const handleTestIcalUrl = async (url: string) => {
		if (!url) return;

		setTestingUrl(url);
		setTestResult(null);
		testIcalUrlMutation.mutate(url);
	};

	const handleSyncCalendar = async (provider: CalendarProvider) => {
		try {
			await trpcClient.rooms.syncCalendar.mutate({
				roomId: room.id,
				platform: provider,
			});

			onRoomUpdate();

			toast.success('Calendar sync started', {
				description: `Calendar sync for ${provider} was triggered successfully.`,
				duration: 4000,
			});
		} catch (error) {
			console.error('Failed to sync calendar:', error);
			toast.error('Failed to sync calendar', {
				description:
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while syncing the calendar.',
				duration: 6000,
			});
		}
	};

	const handleRemoveIcalUrl = async (provider: CalendarProvider) => {
		try {
			await trpcClient.rooms.updateIcalUrls.mutate({
				roomId: room.id,
				airbnbIcalUrl: provider === 'airbnb' ? null : undefined,
				expediaIcalUrl: provider === 'expedia' ? null : undefined,
			});

			onRoomUpdate();
			toast.success('iCal URL removed successfully!', {
				description: `${provider === 'airbnb' ? 'AirBnB' : 'Expedia'} calendar integration has been disabled.`,
				duration: 4000,
			});
		} catch (error) {
			console.error('Failed to remove iCal URL:', error);
			toast.error('Failed to remove iCal URL', {
				description:
					error instanceof Error
						? error.message
						: 'An unexpected error occurred.',
				duration: 5000,
			});
		}
	};

	return (
		<>
			{/* Calendar Integrations Card */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Icon icon="tabler:calendar-cog" className="size-5" />
						Calendar Integrations
					</CardTitle>
					<CardDescription>
						Sync your room's availability with external booking platforms and
						provide an iCal feed for third-party services.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* AirBnB Integration */}
					<div className="border rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<div className="flex flex-wrap items-center gap-2">
								<h5 className="font-medium">AirBnB</h5>
								{room.airbnbIcalUrl ? (
									<Badge variant="secondary">Configured</Badge>
								) : (
									<Badge variant="destructive">Not Configured</Badge>
								)}
							</div>
							<div className="flex flex-wrap gap-2">
								{room.airbnbIcalUrl && (
									<>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												room.airbnbIcalUrl &&
												handleTestIcalUrl(room.airbnbIcalUrl)
											}
											disabled={testingUrl === room.airbnbIcalUrl}
										>
											{testingUrl === room.airbnbIcalUrl && (
												<Icon icon="tabler:refresh" className="animate-spin" />
											)}
											Test
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleSyncCalendar('airbnb')}
										>
											<Icon icon="tabler:refresh" />
											Sync
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => handleRemoveIcalUrl('airbnb')}
										>
											<Icon icon="tabler:circle-x" />
											Disable
										</Button>
									</>
								)}
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleEditCalendar('airbnb')}
								>
									<Icon icon="tabler:edit" />
									{room.airbnbIcalUrl ? 'Edit' : 'Configure'}
								</Button>
							</div>
						</div>

						{room.airbnbIcalUrl && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Icon icon="tabler:link" className="size-4 shrink-0" />
									<span className="text-sm font-mono truncate break-all">
										{room.airbnbIcalUrl}
									</span>
								</div>
								{room.lastAirbnbSync && (
									<div className="flex items-center gap-2">
										<Icon
											icon="tabler:circle-check"
											className="text-primary size-4 shrink-0"
										/>
										<span className="text-sm">
											Last synced:{' '}
											{new Date(room.lastAirbnbSync).toLocaleString()}
										</span>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Expedia Integration */}
					<div className="border rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<div className="flex flex-wrap items-center gap-2">
								<h5 className="font-medium">Expedia</h5>
								{room.expediaIcalUrl ? (
									<Badge variant="secondary">Configured</Badge>
								) : (
									<Badge variant="destructive">Not Configured</Badge>
								)}
							</div>
							<div className="flex flex-wrap gap-2">
								{room.expediaIcalUrl && (
									<>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												room.expediaIcalUrl &&
												handleTestIcalUrl(room.expediaIcalUrl)
											}
											disabled={testingUrl === room.expediaIcalUrl}
										>
											{testingUrl === room.expediaIcalUrl && (
												<Icon icon="tabler:refresh" className="animate-spin" />
											)}
											Test
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleSyncCalendar('expedia')}
										>
											<Icon icon="tabler:refresh" />
											Sync
										</Button>
										<Button
											variant="destructive"
											size="sm"
											onClick={() => handleRemoveIcalUrl('expedia')}
										>
											<Icon icon="tabler:circle-x" />
											Disable
										</Button>
									</>
								)}
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleEditCalendar('expedia')}
								>
									<Icon icon="tabler:edit" />
									{room.expediaIcalUrl ? 'Edit' : 'Configure'}
								</Button>
							</div>
						</div>

						{room.expediaIcalUrl && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Icon icon="tabler:link" className="size-4 shrink-0" />
									<span className="text-sm font-mono truncate break-all">
										{room.expediaIcalUrl}
									</span>
								</div>
								{room.lastExpediaSync && (
									<div className="flex items-center gap-2">
										<Icon
											icon="tabler:circle-check"
											className="text-primary size-4 shrink-0"
										/>
										<span className="text-sm">
											Last synced:{' '}
											{new Date(room.lastExpediaSync).toLocaleString()}
										</span>
									</div>
								)}
							</div>
						)}
					</div>

					{/* Export URLs */}
					<div className="border rounded-lg p-4">
						<h5 className="font-medium mb-3">
							Export Calendar for External Services
						</h5>
						<p className="text-sm mb-4">
							Use this URL to sync this room's availability in .ics format with
							external booking platforms like Airbnb and Expedia.
						</p>
						<div className="space-y-3">
							<div className="flex items-center justify-between gap-2 p-3 rounded-lg">
								<div className="flex items-center gap-2 min-w-0">
									<Icon icon="tabler:external-link" className="size-4" />
									<span className="text-sm">iCal URL:</span>
									<code className="text-sm bg-white px-2 py-1 rounded border font-mono truncate">
										{typeof window !== 'undefined'
											? `${window.location.origin}/api/ical/${room.id}.ics`
											: `/api/ical/${room.id}.ics`}
									</code>
								</div>
								<Button
									variant="secondary"
									size="sm"
									onClick={() => {
										const url =
											typeof window !== 'undefined'
												? `${window.location.origin}/api/ical/${room.id}.ics`
												: `https://irishette.com/api/ical/${room.id}.ics`;
										copyToClipboard(url, 'iCal URL');
									}}
								>
									<Icon icon="tabler:copy" />
									Copy iCal URL
								</Button>
							</div>
							<div className="text-xs pl-5">
								This URL provides real-time availability data including
								confirmed bookings and blocked periods.
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* iCal URL Edit Dialog */}
			<Dialog
				open={!!editingCalendar}
				onOpenChange={(open) => {
					if (!open) {
						setEditingCalendar(null);
						setNewIcalUrl('');
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							Configure{' '}
							{editingCalendar?.provider === 'airbnb' ? 'AirBnB' : 'Expedia'}{' '}
							iCal URL
						</DialogTitle>
						<DialogDescription>
							Enter the iCal URL from your{' '}
							{editingCalendar?.provider === 'airbnb' ? 'AirBnB' : 'Expedia'}{' '}
							calendar to sync availability.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div>
							<Label
								htmlFor={icalUrlId}
								className="block text-sm font-medium mb-1"
							>
								iCal URL
							</Label>
							<Input
								id={icalUrlId}
								value={newIcalUrl}
								onChange={(e) => setNewIcalUrl(e.target.value)}
								placeholder="https://..."
							/>
						</div>
						<div className="flex gap-2">
							<Button onClick={handleSaveIcalUrl}>Save</Button>
							<Button
								variant="outline"
								onClick={() => {
									setEditingCalendar(null);
									setNewIcalUrl('');
								}}
							>
								Cancel
							</Button>
							{newIcalUrl && (
								<Button
									variant="secondary"
									onClick={() => handleTestIcalUrl(newIcalUrl)}
									disabled={testingUrl === newIcalUrl}
								>
									{testingUrl === newIcalUrl && (
										<Icon icon="tabler:refresh" className="animate-spin" />
									)}
									Test
								</Button>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>

			{/* Test Result Dialog */}
			<Dialog
				open={!!testResult}
				onOpenChange={(open) => {
					if (!open) setTestResult(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							{testResult?.success ? (
								<Icon
									icon="tabler:circle-check"
									className="size-5 text-primary"
								/>
							) : (
								<Icon
									icon="tabler:circle-x"
									className="size-5 text-destructive"
								/>
							)}
							iCal Test Result
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{testResult?.success ? (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Icon
										icon="tabler:circle-check"
										className="size-5 text-primary"
									/>
									<span className="text-primary">Calendar is valid!</span>
								</div>
								{testResult.eventCount !== undefined && (
									<p className="text-sm">
										Found {testResult.eventCount} events
									</p>
								)}
								{testResult.nextEvent && (
									<div className="bg-gray-50 p-3 rounded">
										<h5 className="font-medium text-sm mb-1">Next Event:</h5>
										<p className="text-sm">{testResult.nextEvent.summary}</p>
										<p className="text-xs">
											{new Date(testResult.nextEvent.start).toLocaleString()} -{' '}
											{new Date(testResult.nextEvent.end).toLocaleString()}
										</p>
									</div>
								)}
							</div>
						) : (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<Icon
										icon="tabler:circle-x"
										className="size-4 text-destructive"
									/>
									<span className="font-semibold">Test Failed!</span>
								</div>
								{testResult?.error && (
									<p className="text-sm text-destructive">{testResult.error}</p>
								)}
							</div>
						)}
						<Button onClick={() => setTestResult(null)} className="w-full">
							Close
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
