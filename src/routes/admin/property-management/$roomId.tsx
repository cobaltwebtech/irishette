import { Icon } from '@iconify/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
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
import { trpc, trpcClient } from '@/integrations/tanstack-query/root-provider';
import { useSession } from '@/lib/auth-client';
import type {
	CreateBlockedPeriod,
	CreatePricingRule,
	UpdateBlockedPeriod,
	UpdatePricingRule,
} from '@/lib/room-validation';

export const Route = createFileRoute('/admin/property-management/$roomId')({
	head: () => ({
		meta: [
			{
				title: 'Edit Room | Irishette.com',
			},
		],
	}),
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

function EditRoom() {
	const { data: session } = useSession();
	const params = Route.useParams() as { roomId: string };
	const roomId = params.roomId;
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	// Use tRPC query to fetch room data
	const roomQuery = useQuery(
		trpc.rooms.get.queryOptions({ id: roomId }, { enabled: !!roomId }),
	);

	const room = roomQuery.data;
	const loading = roomQuery.isLoading;

	// Use tRPC query to fetch pricing rules - remove enabled dependency on room
	const pricingRulesQuery = useQuery(
		trpc.rooms.getPricingRules.queryOptions({ roomId }, { enabled: !!roomId }),
	);

	// Use tRPC query to fetch blocked periods - remove enabled dependency on room
	const blockedPeriodsQuery = useQuery(
		trpc.rooms.getBlockedPeriods.queryOptions(
			{ roomId },
			{ enabled: !!roomId },
		),
	);

	// Transform data directly from queries - no need for state duplication
	const pricingRules =
		pricingRulesQuery.data?.map((rule) => ({
			...rule,
			isActive: rule.isActive ?? true,
			daysOfWeek: rule.daysOfWeek ?? undefined,
		})) ?? [];

	const blockedPeriods =
		blockedPeriodsQuery.data?.map((period) => ({
			...period,
			notes: period.notes ?? undefined,
		})) ?? [];

	const [formData, setFormData] = useState<RoomFormData>({
		name: '',
		slug: '',
		description: '',
		basePrice: 0,
		serviceFeeRate: 0, // Will be set from database
		stateTaxRate: 0, // Will be set from database
		cityTaxRate: 0, // Will be set from database
		status: 'active',
		isActive: true,
	});

	// Populate form data when room is loaded
	useEffect(() => {
		if (room) {
			setFormData({
				name: room.name,
				slug: room.slug,
				description: room.description || '',
				basePrice: room.basePrice,
				serviceFeeRate: room.serviceFeeRate ?? 0.12, // Only use default if not in DB
				stateTaxRate: room.stateTaxRate ?? 0.06, // Only use default if not in DB
				cityTaxRate: room.cityTaxRate ?? 0.07, // Only use default if not in DB
				status: room.status || 'active',
				isActive: room.isActive ?? true,
			});
		}
	}, [room]);

	// Handle room query error by redirecting
	useEffect(() => {
		if (roomQuery.error) {
			console.error('Failed to load room:', roomQuery.error);
			navigate({ to: '/admin/property-management' });
		}
	}, [roomQuery.error, navigate]);

	// Convert room update to mutation
	const updateRoomMutation = useMutation({
		mutationFn: async (roomData: RoomFormData) => {
			return await trpcClient.rooms.update.mutate({
				id: room?.id || '',
				...roomData,
			});
		},
		onSuccess: () => {
			// Invalidate and refetch room query
			queryClient.invalidateQueries({ queryKey: [['rooms', 'get']] });
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
	});

	// Save room changes
	const handleSaveRoom = async () => {
		if (!room) return;
		updateRoomMutation.mutate(formData);
	};

	// Auto-generate slug from name
	const generateSlug = (name: string) => {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	};

	const handleNameChange = (name: string) => {
		setFormData((prev) => ({
			...prev,
			name,
			slug: generateSlug(name),
		}));
	};

	// Pricing rule mutations
	const createPricingRuleMutation = useMutation({
		mutationFn: (rule: CreatePricingRule) =>
			trpcClient.rooms.createPricingRule.mutate(rule),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getPricingRules']],
			});
		},
		onError: (error) => {
			console.error('Failed to create pricing rule:', error);
		},
	});

	const updatePricingRuleMutation = useMutation({
		mutationFn: (rule: UpdatePricingRule) =>
			trpcClient.rooms.updatePricingRule.mutate(rule),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getPricingRules']],
			});
		},
		onError: (error) => {
			console.error('Failed to update pricing rule:', error);
		},
	});

	const deletePricingRuleMutation = useMutation({
		mutationFn: (ruleId: string) =>
			trpcClient.rooms.deletePricingRule.mutate({ id: ruleId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getPricingRules']],
			});
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
	});

	// Pricing rules management functions
	const handleCreatePricingRule = async (rule: CreatePricingRule) => {
		createPricingRuleMutation.mutate(rule);
	};

	const handleUpdatePricingRule = async (rule: UpdatePricingRule) => {
		updatePricingRuleMutation.mutate(rule);
	};

	const handleDeletePricingRule = async (ruleId: string) => {
		deletePricingRuleMutation.mutate(ruleId);
	};

	// Load pricing rules when room is loaded
	// Blocked periods mutations
	const createBlockedPeriodMutation = useMutation({
		mutationFn: (period: CreateBlockedPeriod) =>
			trpcClient.rooms.createBlockedPeriod.mutate(period),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getBlockedPeriods']],
			});
		},
		onError: (error) => {
			console.error('Failed to create blocked period:', error);
		},
	});

	const updateBlockedPeriodMutation = useMutation({
		mutationFn: (period: UpdateBlockedPeriod) =>
			trpcClient.rooms.updateBlockedPeriod.mutate(period),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getBlockedPeriods']],
			});
		},
		onError: (error) => {
			console.error('Failed to update blocked period:', error);
		},
	});

	const deleteBlockedPeriodMutation = useMutation({
		mutationFn: (periodId: string) =>
			trpcClient.rooms.deleteBlockedPeriod.mutate({ id: periodId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [['rooms', 'getBlockedPeriods']],
			});
		},
		onError: (error) => {
			console.error('Failed to delete blocked period:', error);
		},
	});

	// Blocked periods management functions
	const handleCreateBlockedPeriod = async (period: CreateBlockedPeriod) => {
		createBlockedPeriodMutation.mutate(period);
	};

	const handleUpdateBlockedPeriod = async (period: UpdateBlockedPeriod) => {
		updateBlockedPeriodMutation.mutate(period);
	};

	const handleDeleteBlockedPeriod = async (periodId: string) => {
		deleteBlockedPeriodMutation.mutate(periodId);
	};

	if (!session || loading || !room) {
		return null; // AdminLayout will handle auth and redirect
	}

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
							if (room) updateRoomMutation.mutate(updated);
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
				isLoading={blockedPeriodsQuery.isLoading}
			/>

			{/* Calendar Integrations */}
			<RoomCalendarIntegration
				room={room}
				onRoomUpdate={() => roomQuery.refetch()}
			/>
		</AdminLayout>
	);
}
