import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { RoomBlockingManagement } from '@/components/admin/RoomBlockingManagement';
import { RoomCalendarIntegration } from '@/components/admin/RoomCalendarIntegration';
import { RoomDetails } from '@/components/admin/RoomDetails';
import { RoomPricingConfig } from '@/components/admin/RoomPricingConfig';
import { PricingRulesManagement } from '@/components/admin/RoomPricingRules';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { orNotFound } from '@/integrations/trpc/errors';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import type {
	CreateBlockedPeriod,
	CreatePricingRule,
	UpdateBlockedPeriod,
	UpdatePricingRule,
} from '@/lib/room-validation';

export const Route = createFileRoute(
	'/_authed/_admin/admin/property-management/$publicId',
)({
	head: () => ({
		meta: [
			{
				title: 'Edit Room | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. The room is loaded by publicId; its pricing
	// rules and blocked periods need the internal id, so they load after it.
	loader: async ({ context, params }) => {
		const room = await orNotFound(
			context.queryClient.ensureQueryData(
				context.trpc.rooms.adminGet.queryOptions({ publicId: params.publicId }),
			),
		);
		// Fired together, so the browser sends them as one batched request.
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.rooms.getPricingRules.queryOptions({ roomId: room.id }),
			),
			context.queryClient.ensureQueryData(
				context.trpc.rooms.getBlockedPeriods.queryOptions({ roomId: room.id }),
			),
			context.queryClient.ensureQueryData(
				context.trpc.ical.listFeeds.queryOptions({ roomId: room.id }),
			),
			context.queryClient.ensureQueryData(
				context.trpc.ical.getExportUrl.queryOptions({ roomId: room.id }),
			),
			context.queryClient.ensureQueryData(
				context.trpc.ical.getSyncLogs.queryOptions({
					roomId: room.id,
					limit: 10,
				}),
			),
		]);
	},
	notFoundComponent: RoomNotFound,
	component: EditRoom,
});

// Types for room management
type RoomStatus = 'active' | 'inactive' | 'archived';

// Form types
type RoomFormData = {
	name: string;
	slug: string;
	description: string;
	basePrice: number;
	serviceFeeRate: number;
	stateTaxRate: number;
	cityTaxRate: number;
	status: RoomStatus;
	isActive: boolean; // Keep for backward compatibility
	maxGuests: number;
};

function roomToFormData(room: RouterOutputs['rooms']['get']): RoomFormData {
	return {
		name: room.name,
		slug: room.slug,
		description: room.description || '',
		basePrice: room.basePrice,
		serviceFeeRate: room.serviceFeeRate ?? 0.12, // Only use default if not in DB
		stateTaxRate: room.stateTaxRate ?? 0.06, // Only use default if not in DB
		cityTaxRate: room.cityTaxRate ?? 0.07, // Only use default if not in DB
		status: room.status || 'active',
		isActive: room.isActive ?? true,
		maxGuests: room.maxGuests,
	};
}

// Auto-generate slug from name
const generateSlug = (name: string) => {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();
};

function RoomNotFound() {
	return (
		<div className="container mx-auto px-4 py-8">
			<div className="text-center">
				<h2 className="mb-4 text-2xl font-bold">Room Not Found</h2>
				<p className="mb-4 text-muted-foreground">
					The room you're looking for could not be found.
				</p>
				<Link to="/admin/property-management">
					<Button variant="outline" size="sm">
						← Back to Rooms
					</Button>
				</Link>
			</div>
		</div>
	);
}

function EditRoom() {
	const { publicId } = Route.useParams();
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const roomQuery = useSuspenseQuery(
		trpc.rooms.adminGet.queryOptions({ publicId }),
	);
	const room = roomQuery.data;

	const { data: pricingRulesData } = useSuspenseQuery(
		trpc.rooms.getPricingRules.queryOptions({ roomId: room.id }),
	);
	const { data: blockedPeriodsData } = useSuspenseQuery(
		trpc.rooms.getBlockedPeriods.queryOptions({ roomId: room.id }),
	);

	// Transform data directly from queries - no need for state duplication
	const pricingRules = pricingRulesData.map((rule) => ({
		...rule,
		isActive: rule.isActive ?? true,
	}));

	const blockedPeriods = blockedPeriodsData.map((period) => ({
		...period,
		notes: period.notes ?? undefined,
	}));

	const [formData, setFormData] = useState<RoomFormData>(() =>
		roomToFormData(room),
	);

	// Re-sync the form when the room is refetched (e.g. after saving). Adjusting
	// state during render when a prop changes avoids an extra effect pass:
	// https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
	const [syncedRoom, setSyncedRoom] = useState(room);
	if (syncedRoom !== room) {
		setSyncedRoom(room);
		setFormData(roomToFormData(room));
	}

	// Show error toast on refetch failures (don't redirect - user might be editing)
	useEffect(() => {
		if (roomQuery.error) {
			console.error('Failed to refresh room data:', roomQuery.error);
			toast.add({
				type: 'error',
				title: 'Failed to refresh room data',
				description: 'Using cached data. Changes can still be saved.',
				timeout: 5000,
			});
		}
	}, [roomQuery.error]);

	const updateRoomMutation = useMutation(
		trpc.rooms.update.mutationOptions({
			onSuccess: () => {
				// Every room query (public and admin): name and status also appear
				// in the sidebar, the property list and the public room pages.
				void queryClient.invalidateQueries(trpc.rooms.pathFilter());
				toast.add({
					type: 'success',
					title: 'Room updated successfully!',
					description: `${formData.name} has been updated with the latest settings.`,
					timeout: 4000,
				});
			},
			onError: (error) => {
				toast.add({
					type: 'error',
					title: 'Error updating room',
					description: error.message,
					timeout: 5000,
				});
			},
		}),
	);

	// Save room changes (isActive follows status on the server)
	const handleSaveRoom = () => {
		const { isActive: _isActive, ...changes } = formData;
		updateRoomMutation.mutate({ id: room.id, ...changes });
	};

	const handleNameChange = (name: string) => {
		setFormData((prev) => ({
			...prev,
			name,
			slug: generateSlug(name),
		}));
	};

	// Pricing rule mutations
	const createPricingRuleMutation = useMutation(
		trpc.rooms.createPricingRule.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getPricingRules.pathFilter(),
				);
			},
		}),
	);

	const updatePricingRuleMutation = useMutation(
		trpc.rooms.updatePricingRule.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getPricingRules.pathFilter(),
				);
			},
		}),
	);

	const deletePricingRuleMutation = useMutation(
		trpc.rooms.deletePricingRule.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getPricingRules.pathFilter(),
				);
			},
		}),
	);

	// The forms await these: they close and show success only after the
	// server answers, and show its errors (overlap conflicts) otherwise.
	const handleCreatePricingRule = async (rule: CreatePricingRule) => {
		await createPricingRuleMutation.mutateAsync(rule);
	};

	const handleUpdatePricingRule = async (rule: UpdatePricingRule) => {
		await updatePricingRuleMutation.mutateAsync(rule);
	};

	const handleDeletePricingRule = async (ruleId: string) => {
		await deletePricingRuleMutation.mutateAsync({ id: ruleId });
	};

	// Blocked periods mutations
	const createBlockedPeriodMutation = useMutation(
		trpc.rooms.createBlockedPeriod.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
		}),
	);

	const updateBlockedPeriodMutation = useMutation(
		trpc.rooms.updateBlockedPeriod.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
		}),
	);

	const deleteBlockedPeriodMutation = useMutation(
		trpc.rooms.deleteBlockedPeriod.mutationOptions({
			onSuccess: () => {
				void queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
		}),
	);

	// Blocked periods management functions
	const handleCreateBlockedPeriod = async (period: CreateBlockedPeriod) => {
		await createBlockedPeriodMutation.mutateAsync(period);
	};

	const handleUpdateBlockedPeriod = async (period: UpdateBlockedPeriod) => {
		await updateBlockedPeriodMutation.mutateAsync(period);
	};

	const handleDeleteBlockedPeriod = async (periodId: string) => {
		await deleteBlockedPeriodMutation.mutateAsync({ id: periodId });
	};

	return (
		<AdminLayout title={`Edit Room: ${room.name}`}>
			<div className="mb-6 flex items-center justify-between">
				<Link to="/admin/property-management">
					<Button variant="outline" size="sm">
						← Back to Rooms
					</Button>
				</Link>
				<div className="flex gap-2">
					<Button
						variant="secondary"
						onClick={handleSaveRoom}
						disabled={updateRoomMutation.isPending}
					>
						{updateRoomMutation.isPending ? (
							<Icon icon="tabler:loader-2" className="size-4 animate-spin" />
						) : (
							<Icon icon="tabler:device-floppy" />
						)}
						{updateRoomMutation.isPending ? 'Saving...' : 'Save Changes'}
					</Button>
					<Badge
						variant={room.status === 'active' ? 'default' : 'secondary'}
						className="px-4 py-1 text-lg capitalize"
					>
						{room.status}
					</Badge>
				</div>
			</div>

			{/* Room Details */}
			<div className="grid gap-8 lg:grid-cols-3">
				<RoomDetails
					name={formData.name}
					slug={formData.slug}
					description={formData.description}
					status={formData.status}
					isActive={formData.isActive}
					roomId={room.id}
					createdAt={room.createdAt}
					updatedAt={room.updatedAt}
					onNameChange={handleNameChange}
					onSlugChange={(value) =>
						setFormData((prev) => ({ ...prev, slug: value }))
					}
					onDescriptionChange={(value) =>
						setFormData((prev) => ({ ...prev, description: value }))
					}
					onStatusChange={(checked: boolean) => {
						// Persist immediately. The mutation runs outside the state
						// updater (updaters must be pure; StrictMode runs them twice).
						const status = checked
							? ('active' as const)
							: ('inactive' as const);
						setFormData((prev) => ({ ...prev, isActive: checked, status }));
						updateRoomMutation.mutate({ id: room.id, status });
					}}
				/>

				{/* Pricing & Tax Config */}
				<RoomPricingConfig
					basePrice={formData.basePrice}
					serviceFeeRate={formData.serviceFeeRate}
					stateTaxRate={formData.stateTaxRate}
					cityTaxRate={formData.cityTaxRate}
					maxGuests={formData.maxGuests}
					onMaxGuestsChange={(value) =>
						setFormData((prev) => ({ ...prev, maxGuests: value }))
					}
					onBasePriceChange={(value) =>
						setFormData((prev) => ({ ...prev, basePrice: value }))
					}
					onServiceFeeRateChange={(value) =>
						setFormData((prev) => ({ ...prev, serviceFeeRate: value }))
					}
					onStateTaxRateChange={(value) =>
						setFormData((prev) => ({ ...prev, stateTaxRate: value }))
					}
					onCityTaxRateChange={(value) =>
						setFormData((prev) => ({ ...prev, cityTaxRate: value }))
					}
				/>
			</div>

			{/* Pricing Rules Management */}
			<PricingRulesManagement
				roomId={room.id}
				roomName={room.name}
				basePrice={room.basePrice}
				pricingRules={pricingRules}
				onCreateRule={handleCreatePricingRule}
				onUpdateRule={handleUpdatePricingRule}
				onDeleteRule={handleDeletePricingRule}
			/>

			{/* Room Blocking Management */}
			<RoomBlockingManagement
				roomId={room.id}
				blockedPeriods={blockedPeriods}
				onCreateBlockedPeriod={handleCreateBlockedPeriod}
				onUpdateBlockedPeriod={handleUpdateBlockedPeriod}
				onDeleteBlockedPeriod={handleDeleteBlockedPeriod}
			/>

			{/* Calendar Integrations */}
			<RoomCalendarIntegration roomId={room.id} />
		</AdminLayout>
	);
}
