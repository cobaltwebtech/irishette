import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	CheckCircle,
	Edit,
	ExternalLink,
	RefreshCw,
	Save,
	Settings,
	TestTube,
	X,
	XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { PricingRulesManagement } from '@/components/PricingRulesManagement';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/lib/auth-client';
import type {
	CreatePricingRule,
	RoomPricingRule,
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

type Room = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	basePrice: number;
	serviceFeeRate: number;
	stateTaxRate: number;
	cityTaxRate: number;
	status: RoomStatus;
	isActive: boolean | null; // Keep for backward compatibility
	airbnbIcalUrl: string | null;
	expediaIcalUrl: string | null;
	lastAirbnbSync: Date | null;
	lastExpediaSync: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

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
	const roomNameId = useId();
	const roomSlugId = useId();
	const roomDescriptionId = useId();
	const basePriceId = useId();
	const serviceFeeRateId = useId();
	const stateTaxRateId = useId();
	const cityTaxRateId = useId();
	const icalUrlId = useId();

	const [room, setRoom] = useState<Room | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
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

	// Calendar management state
	const [editingCalendar, setEditingCalendar] = useState<{
		provider: CalendarProvider;
	} | null>(null);
	const [newIcalUrl, setNewIcalUrl] = useState('');
	const [testingUrl, setTestingUrl] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<TestResult | null>(null);

	// Pricing rules state
	const [pricingRules, setPricingRules] = useState<RoomPricingRule[]>([]);

	// Load room data
	const loadRoom = useCallback(async () => {
		try {
			setLoading(true);
			const inputParam = encodeURIComponent(JSON.stringify({ id: roomId }));
			const response = await fetch(`/api/trpc/rooms.get?input=${inputParam}`, {
				method: 'GET',
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('API Error:', errorText);
				throw new Error('Failed to fetch room');
			}

			const data = (await response.json()) as {
				result: { data: Room };
			};

			const roomData = data.result.data;
			setRoom(roomData);
			setFormData({
				name: roomData.name,
				slug: roomData.slug,
				description: roomData.description || '',
				basePrice: roomData.basePrice,
				serviceFeeRate: roomData.serviceFeeRate ?? 0.12, // Only use default if not in DB
				stateTaxRate: roomData.stateTaxRate ?? 0.06, // Only use default if not in DB
				cityTaxRate: roomData.cityTaxRate ?? 0.07, // Only use default if not in DB
				status: roomData.status || 'active',
				isActive: roomData.isActive ?? true,
			});
		} catch (error) {
			console.error('Failed to load room:', error);
			// If room not found, redirect back to property management
			navigate({ to: '/admin/property-management' });
		} finally {
			setLoading(false);
		}
	}, [roomId, navigate]);

	// Load room on component mount
	useEffect(() => {
		loadRoom();
	}, [loadRoom]);

	// Save room changes
	const handleSaveRoom = async () => {
		if (!room) return;

		try {
			setSaving(true);
			const response = await fetch('/api/trpc/rooms.update', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					id: room.id,
					...formData,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Update room error:', errorText);
				throw new Error('Failed to update room');
			}

			// Reload room data to get updated values
			await loadRoom();

			// Show success toast
			toast.success('Room updated successfully!', {
				description: `${formData.name} has been updated with the latest settings.`,
				duration: 4000,
			});
		} catch (error) {
			console.error('Failed to save room:', error);

			// Show error toast
			toast.error('Failed to save room', {
				description:
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while saving the room.',
				duration: 5000,
			});
		} finally {
			setSaving(false);
		}
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

	// Load pricing rules for this room
	const loadPricingRules = useCallback(async () => {
		try {
			const inputParam = encodeURIComponent(JSON.stringify({ roomId }));
			const response = await fetch(
				`/api/trpc/rooms.getPricingRules?input=${inputParam}`,
				{
					method: 'GET',
				},
			);

			if (!response.ok) {
				console.error('Failed to fetch pricing rules');
				return;
			}

			const data = (await response.json()) as {
				result: { data: RoomPricingRule[] };
			};

			setPricingRules(data.result.data);
		} catch (error) {
			console.error('Failed to load pricing rules:', error);
		}
	}, [roomId]);

	// Pricing rules management functions
	const handleCreatePricingRule = async (rule: CreatePricingRule) => {
		const response = await fetch('/api/trpc/rooms.createPricingRule', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ json: rule }),
		});

		const result = (await response.json()) as {
			error?: {
				json?: { message: string };
				message?: string;
			};
		};

		// Check for tRPC error format
		if (result.error) {
			const errorMessage =
				result.error.json?.message ||
				result.error.message ||
				'Failed to create pricing rule';
			throw new Error(errorMessage);
		}

		if (!response.ok) {
			throw new Error('Failed to create pricing rule');
		}

		// Reload pricing rules
		await loadPricingRules();
	};

	const handleUpdatePricingRule = async (rule: UpdatePricingRule) => {
		const response = await fetch('/api/trpc/rooms.updatePricingRule', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ json: rule }),
		});

		const result = (await response.json()) as {
			error?: {
				json?: { message: string };
				message?: string;
			};
		};

		// Check for tRPC error format
		if (result.error) {
			const errorMessage =
				result.error.json?.message ||
				result.error.message ||
				'Failed to update pricing rule';
			throw new Error(errorMessage);
		}

		if (!response.ok) {
			throw new Error('Failed to update pricing rule');
		}

		// Reload pricing rules
		await loadPricingRules();
	};

	const handleDeletePricingRule = async (ruleId: string) => {
		try {
			const response = await fetch('/api/trpc/rooms.deletePricingRule', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ id: ruleId }),
			});

			if (!response.ok) {
				throw new Error('Failed to delete pricing rule');
			}

			// Reload pricing rules
			await loadPricingRules();

			toast.success('Pricing rule deleted successfully!', {
				description: 'The pricing rule has been removed.',
				duration: 4000,
			});
		} catch (error) {
			console.error('Failed to delete pricing rule:', error);
			toast.error('Failed to delete pricing rule', {
				description:
					error instanceof Error
						? error.message
						: 'An unexpected error occurred.',
				duration: 5000,
			});
		}
	};

	// Load pricing rules when room is loaded
	useEffect(() => {
		if (room) {
			loadPricingRules();
		}
	}, [room, loadPricingRules]);

	// Calendar management functions
	const handleEditCalendar = (provider: CalendarProvider) => {
		if (room) {
			setEditingCalendar({ provider });
			setNewIcalUrl(
				provider === 'airbnb'
					? room.airbnbIcalUrl || ''
					: room.expediaIcalUrl || '',
			);
		}
	};

	const handleSaveIcalUrl = async () => {
		if (!editingCalendar || !room) return;

		try {
			const input = JSON.stringify({
				roomId: room.id,
				airbnbIcalUrl:
					editingCalendar.provider === 'airbnb' ? newIcalUrl : undefined,
				expediaIcalUrl:
					editingCalendar.provider === 'expedia' ? newIcalUrl : undefined,
			});

			const response = await fetch(`/api/trpc/rooms.updateIcalUrls`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: input,
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Update iCal URL error:', errorText);
				throw new Error('Failed to update iCal URL');
			}

			await loadRoom();
			setEditingCalendar(null);
			setNewIcalUrl('');
		} catch (error) {
			console.error('Failed to save iCal URL:', error);
		}
	};

	const handleTestIcalUrl = async (url: string) => {
		if (!url) return;

		setTestingUrl(url);
		setTestResult(null);

		try {
			const response = await fetch('/api/trpc/rooms.testIcalUrl', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ url }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Test iCal URL error:', errorText);
				throw new Error('Failed to test iCal URL');
			}

			const data = (await response.json()) as Record<string, unknown>;
			const resultData = (data.result as Record<string, unknown>)
				?.data as TestResult;
			setTestResult(resultData || (data as TestResult));
		} catch (error) {
			setTestResult({
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		} finally {
			setTestingUrl(null);
		}
	};

	const handleSyncCalendar = async (provider: CalendarProvider) => {
		if (!room) return;

		try {
			const input = JSON.stringify({ roomId: room.id, platform: provider });

			const response = await fetch(`/api/trpc/rooms.syncCalendar`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: input,
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Sync calendar error:', errorText);
				throw new Error('Failed to sync calendar');
			}

			await loadRoom();
		} catch (error) {
			console.error('Failed to sync calendar:', error);
		}
	};

	const handleRemoveIcalUrl = async (provider: CalendarProvider) => {
		if (!room) return;

		try {
			const input = JSON.stringify({
				roomId: room.id,
				airbnbIcalUrl: provider === 'airbnb' ? null : undefined,
				expediaIcalUrl: provider === 'expedia' ? null : undefined,
			});

			const response = await fetch(`/api/trpc/rooms.updateIcalUrls`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: input,
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('Remove iCal URL error:', errorText);
				throw new Error('Failed to remove iCal URL');
			}

			await loadRoom();
		} catch (error) {
			console.error('Failed to remove iCal URL:', error);
		}
	};

	if (!session) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-4">Access Denied</h1>
					<p className="mb-4">You must be logged in to access this page.</p>
					<Link to="/login" className="text-blue-600 hover:underline">
						Go to Login
					</Link>
				</div>
			</div>
		);
	}

	if (loading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center py-8">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
					<p className="mt-2 text-gray-600">Loading room...</p>
				</div>
			</div>
		);
	}

	if (!room) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="text-center">
					<h1 className="text-2xl font-bold mb-4">Room Not Found</h1>
					<p className="mb-4">The room you're looking for doesn't exist.</p>
					<Link
						to="/admin/property-management"
						className="text-blue-600 hover:underline"
					>
						Back to Property Management
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-6">
				<Link
					to="/admin/property-management"
					className="inline-flex items-center text-blue-600 hover:underline mb-4"
				>
					<ArrowLeft className="h-4 w-4 mr-2" />
					Back to Property Management
				</Link>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold flex items-center gap-2">
							<Edit className="h-8 w-8" />
							Edit Room: {room.name}
						</h1>
						<p className="text-gray-600 mt-2">
							Update room details and settings
						</p>
					</div>
					<div className="flex gap-2">
						<Button
							onClick={handleSaveRoom}
							disabled={saving}
							className="flex items-center gap-2"
						>
							{saving ? (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							) : (
								<Save className="h-4 w-4" />
							)}
							{saving ? 'Saving...' : 'Save Changes'}
						</Button>
						<Button
							variant="outline"
							onClick={() => navigate({ to: '/admin/property-management' })}
							className="flex items-center gap-2"
						>
							<X className="h-4 w-4" />
							Cancel
						</Button>
					</div>
				</div>
			</div>

			{/* Room Form */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between">
						<span>Room Details</span>
						<Badge
							className="capitalize"
							variant={
								room.status === 'active'
									? 'default'
									: room.status === 'inactive'
										? 'secondary'
										: 'destructive'
							}
						>
							{room.status}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid md:grid-cols-2 gap-6">
						<div>
							<Label htmlFor={roomNameId} className="text-sm font-medium mb-2">
								Room Name
							</Label>
							<Input
								id={roomNameId}
								value={formData.name}
								onChange={(e) => handleNameChange(e.target.value)}
								placeholder="e.g., Rose Room"
							/>
						</div>
						<div>
							<Label htmlFor={roomSlugId} className="text-sm font-medium mb-2">
								Slug
							</Label>
							<Input
								id={roomSlugId}
								value={formData.slug}
								onChange={(e) =>
									setFormData((prev) => ({ ...prev, slug: e.target.value }))
								}
								placeholder="e.g., rose-room"
							/>
						</div>
					</div>

					<div>
						<Label
							htmlFor={roomDescriptionId}
							className="text-sm font-medium mb-2"
						>
							Description
						</Label>
						<Input
							id={roomDescriptionId}
							value={formData.description}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									description: e.target.value,
								}))
							}
							placeholder="Room description (optional)"
						/>
					</div>

					<div className="grid md:grid-cols-3 gap-6">
						<div>
							<div className="text-sm font-medium mb-2">Room Status</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="outline"
										className="w-full justify-start capitalize"
									>
										{formData.status}
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-full">
									<DropdownMenuItem
										onClick={() =>
											setFormData((prev) => ({
												...prev,
												status: 'active',
												isActive: true,
											}))
										}
									>
										Active
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											setFormData((prev) => ({
												...prev,
												status: 'inactive',
												isActive: false,
											}))
										}
									>
										Inactive
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>

					<div className="border-t pt-6">
						<h3 className="text-lg font-medium mb-4 flex items-center gap-2">
							<Settings className="h-5 w-5" />
							Pricing & Tax Configuration
						</h3>
						<p className="text-sm text-gray-600 mb-4">
							Configure service fee and tax rates applied to room bookings.
							Hotel occupancy tax is calculated on room price only (excluding
							service fees).
						</p>
						<div className="grid md:grid-cols-6 gap-6">
							<div>
								<Label
									htmlFor={basePriceId}
									className="text-sm font-medium mb-2"
								>
									Base Price ($)
								</Label>
								<Input
									id={basePriceId}
									type="number"
									step="1.00"
									min="0"
									value={formData.basePrice}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											basePrice: parseFloat(e.target.value) || 0,
										}))
									}
									placeholder="0.00"
								/>
							</div>

							<div>
								<Label
									htmlFor={serviceFeeRateId}
									className="text-sm font-medium mb-2"
								>
									Service Fee Rate (%)
								</Label>
								<Input
									id={serviceFeeRateId}
									type="number"
									step="1.00"
									min="0"
									max="100"
									value={(formData.serviceFeeRate * 100).toFixed(2)}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											serviceFeeRate: parseFloat(e.target.value) / 100 || 0,
										}))
									}
									placeholder="12.00"
								/>
							</div>

							<div className="md:col-span-2">
								<Label
									htmlFor={stateTaxRateId}
									className="text-sm font-medium mb-2"
								>
									State of Texas Hotel Occupancy Tax Rate (%)
								</Label>
								<Input
									id={stateTaxRateId}
									type="number"
									step="0.01"
									min="0"
									max="100"
									value={(formData.stateTaxRate * 100).toFixed(2)}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											stateTaxRate: parseFloat(e.target.value) / 100 || 0,
										}))
									}
									placeholder="6.00"
								/>
								<p className="text-xs text-gray-500 mt-1">
									Current: {(formData.stateTaxRate * 100).toFixed(1)}%
								</p>
							</div>

							<div className="md:col-span-2">
								<Label
									htmlFor={cityTaxRateId}
									className="text-sm font-medium mb-2"
								>
									City of Dublin Hotel Occupancy Tax Rate (%)
								</Label>
								<Input
									id={cityTaxRateId}
									type="number"
									step="0.01"
									min="0"
									max="100"
									value={(formData.cityTaxRate * 100).toFixed(2)}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											cityTaxRate: parseFloat(e.target.value) / 100 || 0,
										}))
									}
									placeholder="7.00"
								/>
								<p className="text-xs text-gray-500 mt-1">
									Current: {(formData.cityTaxRate * 100).toFixed(1)}%
								</p>
							</div>
						</div>
					</div>

					{/* Room metadata */}
					<div className="border-t pt-6">
						<h3 className="text-lg font-medium mb-4">Room Information</h3>
						<div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
							<div>
								<span className="font-medium">Room ID:</span> {room.id}
							</div>
							<div>
								<span className="font-medium">Created:</span>{' '}
								{new Date(room.createdAt).toLocaleDateString()}
							</div>
							<div>
								<span className="font-medium">Last Updated:</span>{' '}
								{new Date(room.updatedAt).toLocaleDateString()}
							</div>
							<div>
								<span className="font-medium">Public URL:</span>{' '}
								<code className="text-blue-600">/{room.slug}</code>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Pricing Rules Management */}
			<div className="mt-6">
				<PricingRulesManagement
					roomId={room.id}
					roomName={room.name}
					basePrice={room.basePrice}
					pricingRules={pricingRules}
					onCreateRule={handleCreatePricingRule}
					onUpdateRule={handleUpdatePricingRule}
					onDeleteRule={handleDeletePricingRule}
				/>
			</div>

			{/* iCal URL Edit Modal */}
			{editingCalendar && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<Card className="w-full max-w-md">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Settings className="h-5 w-5" />
								Configure{' '}
								{editingCalendar.provider === 'airbnb' ? 'AirBnB' : 'Expedia'}{' '}
								iCal URL
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
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
									onClick={() => setEditingCalendar(null)}
								>
									Cancel
								</Button>
								{newIcalUrl && (
									<Button
										variant="outline"
										onClick={() => handleTestIcalUrl(newIcalUrl)}
										disabled={testingUrl === newIcalUrl}
									>
										{testingUrl === newIcalUrl ? (
											<RefreshCw className="h-3 w-3 animate-spin mr-1" />
										) : (
											<TestTube className="h-3 w-3 mr-1" />
										)}
										Test
									</Button>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}

			{/* Calendar Integrations */}
			<Card className="mt-6">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Calendar className="h-5 w-5" />
						Calendar Integrations
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{/* AirBnB Integration */}
					<div className="border rounded-lg p-4">
						<div className="flex items-center justify-between mb-3">
							<div className="flex items-center gap-2">
								<h5 className="font-medium">AirBnB</h5>
								{room.airbnbIcalUrl ? (
									<Badge variant="secondary">Configured</Badge>
								) : (
									<Badge variant="destructive">Not Configured</Badge>
								)}
							</div>
							<div className="flex gap-2">
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
											className="flex items-center gap-1"
										>
											{testingUrl === room.airbnbIcalUrl ? (
												<RefreshCw className="h-3 w-3 animate-spin" />
											) : (
												<TestTube className="h-3 w-3" />
											)}
											Test
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleSyncCalendar('airbnb')}
											className="flex items-center gap-1"
										>
											<RefreshCw className="h-3 w-3" />
											Sync
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleRemoveIcalUrl('airbnb')}
											className="flex items-center gap-1 text-red-600"
										>
											<X className="h-3 w-3" />
											Remove
										</Button>
									</>
								)}
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleEditCalendar('airbnb')}
									className="flex items-center gap-1"
								>
									<Edit className="h-3 w-3" />
									{room.airbnbIcalUrl ? 'Edit' : 'Configure'}
								</Button>
							</div>
						</div>

						{room.airbnbIcalUrl && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<ExternalLink className="h-3 w-3 text-gray-400" />
									<span className="text-sm text-gray-600 font-mono break-all">
										{room.airbnbIcalUrl}
									</span>
								</div>
								{room.lastAirbnbSync && (
									<div className="flex items-center gap-2">
										<CheckCircle className="h-3 w-3 text-green-500" />
										<span className="text-sm text-gray-600">
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
							<div className="flex items-center gap-2">
								<h5 className="font-medium">Expedia</h5>
								{room.expediaIcalUrl ? (
									<Badge variant="secondary">Configured</Badge>
								) : (
									<Badge variant="destructive">Not Configured</Badge>
								)}
							</div>
							<div className="flex gap-2">
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
											className="flex items-center gap-1"
										>
											{testingUrl === room.expediaIcalUrl ? (
												<RefreshCw className="h-3 w-3 animate-spin" />
											) : (
												<TestTube className="h-3 w-3" />
											)}
											Test
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleSyncCalendar('expedia')}
											className="flex items-center gap-1"
										>
											<RefreshCw className="h-3 w-3" />
											Sync
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleRemoveIcalUrl('expedia')}
											className="flex items-center gap-1 text-red-600"
										>
											<X className="h-3 w-3" />
											Remove
										</Button>
									</>
								)}
								<Button
									variant="outline"
									size="sm"
									onClick={() => handleEditCalendar('expedia')}
									className="flex items-center gap-1"
								>
									<Edit className="h-3 w-3" />
									{room.expediaIcalUrl ? 'Edit' : 'Configure'}
								</Button>
							</div>
						</div>

						{room.expediaIcalUrl && (
							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<ExternalLink className="h-3 w-3 text-gray-400" />
									<span className="text-sm text-gray-600 font-mono break-all">
										{room.expediaIcalUrl}
									</span>
								</div>
								{room.lastExpediaSync && (
									<div className="flex items-center gap-2">
										<CheckCircle className="h-3 w-3 text-green-500" />
										<span className="text-sm text-gray-600">
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
						<h5 className="font-medium mb-2">Export Calendar</h5>
						<div className="space-y-2">
							<div className="flex items-center gap-2">
								<ExternalLink className="h-3 w-3 text-gray-400" />
								<span className="text-sm text-gray-600">By ID:</span>
								<code className="text-sm bg-gray-100 px-2 py-1 rounded">
									/api/rooms/{room.id}/calendar.ics
								</code>
							</div>
							<div className="flex items-center gap-2">
								<ExternalLink className="h-3 w-3 text-gray-400" />
								<span className="text-sm text-gray-600">By Slug:</span>
								<code className="text-sm bg-gray-100 px-2 py-1 rounded">
									/api/rooms/slug/{room.slug}/calendar.ics
								</code>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Test Result Modal */}
			{testResult && (
				<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
					<Card className="w-full max-w-md">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								{testResult.success ? (
									<CheckCircle className="h-5 w-5 text-green-500" />
								) : (
									<XCircle className="h-5 w-5 text-red-500" />
								)}
								iCal Test Result
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{testResult.success ? (
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<CheckCircle className="h-4 w-4 text-green-500" />
										<span className="text-green-700">Calendar is valid!</span>
									</div>
									{testResult.eventCount !== undefined && (
										<p className="text-sm text-gray-600">
											Found {testResult.eventCount} events
										</p>
									)}
									{testResult.nextEvent && (
										<div className="bg-gray-50 p-3 rounded">
											<h5 className="font-medium text-sm mb-1">Next Event:</h5>
											<p className="text-sm">{testResult.nextEvent.summary}</p>
											<p className="text-xs text-gray-500">
												{new Date(testResult.nextEvent.start).toLocaleString()}{' '}
												- {new Date(testResult.nextEvent.end).toLocaleString()}
											</p>
										</div>
									)}
								</div>
							) : (
								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<AlertCircle className="h-4 w-4 text-red-500" />
										<span className="text-red-700">Test failed</span>
									</div>
									{testResult.error && (
										<p className="text-sm text-red-600">{testResult.error}</p>
									)}
								</div>
							)}
							<Button onClick={() => setTestResult(null)} className="w-full">
								Close
							</Button>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
