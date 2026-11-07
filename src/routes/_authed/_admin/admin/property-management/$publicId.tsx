import { Icon } from '@iconify/react';
import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { RoomBlockingManagement } from '@/components/admin/RoomBlockingManagement';
import { RoomCalendarIntegration } from '@/components/admin/RoomCalendarIntegration';
import { RoomDetails } from '@/components/admin/RoomDetails';
import { RoomPricingConfig } from '@/components/admin/RoomPricingConfig';
import { PricingRulesManagement } from '@/components/admin/RoomPricingRules';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
				context.trpc.rooms.get.queryOptions({ publicId: params.publicId }),
			),
		);
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.rooms.getPricingRules.queryOptions({ roomId: room.id }),
			),
			context.queryClient.ensureQueryData(
				context.trpc.rooms.getBlockedPeriods.queryOptions({ roomId: room.id }),
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
				<h2 className="text-2xl font-bold mb-4">Room Not Found</h2>
				<p className="text-muted-foreground mb-4">
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

	const roomQuery = useSuspenseQuery(trpc.rooms.get.queryOptions({ publicId }));
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

	// Re-sync the form when the room is refetched (e.g. after saving)
	useEffect(() => {
		setFormData(roomToFormData(room));
	}, [room]);

	// Show error toast on refetch failures (don't redirect - user might be editing)
	useEffect(() => {
		if (roomQuery.error) {
			console.error('Failed to refresh room data:', roomQuery.error);
			toast.error('Failed to refresh room data', {
				description: 'Using cached data. Changes can still be saved.',
				duration: 5000,
			});
		}
	}, [roomQuery.error]);

	const updateRoomMutation = useMutation(
		trpc.rooms.update.mutationOptions({
			onSuccess: () => {
				// Room name/status also appear in the rooms list and admin sidebar
				queryClient.invalidateQueries(trpc.rooms.get.pathFilter());
				queryClient.invalidateQueries(trpc.rooms.list.pathFilter());
				toast.success('Room updated successfully!', {
					description: `${formData.name} has been updated with the latest settings.`,
					duration: 4000,
				});
			},
			onError: (error) => {
				console.error('Update room error:', error);
				toast.error('Error updating room', {
					description:
						'Please try again or contact support if the problem persists.',
					duration: 4000,
				});
			},
		}),
	);

	// Save room changes
	const handleSaveRoom = async () => {
		updateRoomMutation.mutate({ id: room.id, ...formData });
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
				queryClient.invalidateQueries(trpc.rooms.getPricingRules.pathFilter());
			},
			onError: (error) => {
				console.error('Failed to create pricing rule:', error);
			},
		}),
	);

	const updatePricingRuleMutation = useMutation(
		trpc.rooms.updatePricingRule.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.rooms.getPricingRules.pathFilter());
			},
			onError: (error) => {
				console.error('Failed to update pricing rule:', error);
			},
		}),
	);

	const deletePricingRuleMutation = useMutation(
		trpc.rooms.deletePricingRule.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(trpc.rooms.getPricingRules.pathFilter());
				toast.success('Pricing rule deleted successfully!', {
					description: 'The pricing rule has been removed.',
					duration: 4000,
				});
			},
			onError: (error) => {
				console.error('Failed to delete pricing rule:', error);
				toast.error('Failed to delete pricing rule', {
					description:
						error instanceof Error
							? error.message
							: 'An unexpected error occurred.',
					duration: 5000,
				});
			},
		}),
	);

	// Pricing rules management functions
	const handleCreatePricingRule = async (rule: CreatePricingRule) => {
		createPricingRuleMutation.mutate(rule);
	};

	const handleUpdatePricingRule = async (rule: UpdatePricingRule) => {
		updatePricingRuleMutation.mutate(rule);
	};

	const handleDeletePricingRule = async (ruleId: string) => {
		deletePricingRuleMutation.mutate({ id: ruleId });
	};

	// Blocked periods mutations
	const createBlockedPeriodMutation = useMutation(
		trpc.rooms.createBlockedPeriod.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
			onError: (error) => {
				console.error('Failed to create blocked period:', error);
			},
		}),
	);

	const updateBlockedPeriodMutation = useMutation(
		trpc.rooms.updateBlockedPeriod.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
			onError: (error) => {
				console.error('Failed to update blocked period:', error);
			},
		}),
	);

	const deleteBlockedPeriodMutation = useMutation(
		trpc.rooms.deleteBlockedPeriod.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.rooms.getBlockedPeriods.pathFilter(),
				);
			},
			onError: (error) => {
				console.error('Failed to delete blocked period:', error);
			},
		}),
	);

	// Blocked periods management functions
	const handleCreateBlockedPeriod = async (period: CreateBlockedPeriod) => {
		createBlockedPeriodMutation.mutate(period);
	};

	const handleUpdateBlockedPeriod = async (period: UpdateBlockedPeriod) => {
		updateBlockedPeriodMutation.mutate(period);
	};

	const handleDeleteBlockedPeriod = async (periodId: string) => {
		deleteBlockedPeriodMutation.mutate({ id: periodId });
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
							<Icon icon="tabler:loader-2" className="animate-spin size-4" />
						) : (
							<Icon icon="tabler:device-floppy" />
						)}
						{updateRoomMutation.isPending ? 'Saving...' : 'Save Changes'}
					</Button>
					<Badge
						variant={room.status === 'active' ? 'default' : 'secondary'}
						className="capitalize text-lg px-4 py-1"
					>
						{room.status}
					</Badge>
				</div>
			</div>

			{/* Room Details */}
			<div className="grid lg:grid-cols-3 gap-8">
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
						setFormData((prev) => {
							const updated = {
								...prev,
								isActive: checked,
								status: checked ? ('active' as const) : ('inactive' as const),
							};
							// Persist change immediately
							updateRoomMutation.mutate({ id: room.id, ...updated });
							return updated;
						});
					}}
				/>

				{/* Pricing & Tax Config */}
				<RoomPricingConfig
					basePrice={formData.basePrice}
					serviceFeeRate={formData.serviceFeeRate}
					stateTaxRate={formData.stateTaxRate}
					cityTaxRate={formData.cityTaxRate}
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
			<RoomCalendarIntegration
				room={room}
				onRoomUpdate={() =>
					queryClient.invalidateQueries(trpc.rooms.get.pathFilter())
				}
			/>
		</AdminLayout>
	);
}
