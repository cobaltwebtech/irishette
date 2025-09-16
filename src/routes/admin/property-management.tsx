import { createFileRoute, Link } from '@tanstack/react-router';
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	CheckCircle,
	Edit,
	ExternalLink,
	Home,
	Plus,
	RefreshCw,
	Settings,
	TestTube,
	X,
	XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
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
import { useSession } from '@/lib/auth-client';

export const Route = createFileRoute('/admin/property-management')({
	head: () => ({
		meta: [
			{
				title: 'Property Management | Irishette.com',
			},
		],
	}),
	component: PropertyManagement,
});

// Types for room management
type RoomStatus = 'active' | 'inactive' | 'archived';

type Room = {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	basePrice: number;
	status: RoomStatus;
	isActive: boolean | null; // Keep for backward compatibility
	airbnbIcalUrl: string | null;
	expediaIcalUrl: string | null;
	lastAirbnbSync: Date | null;
	lastExpediaSync: Date | null;
	createdAt: Date;
	updatedAt: Date;
};

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

// Form types
type RoomFormData = {
	name: string;
	slug: string;
	description: string;
	basePrice: number;
	status: RoomStatus;
	isActive: boolean; // Keep for backward compatibility
};

type EditMode = 'none' | 'add' | 'edit';

function PropertyManagement() {
	const { data: session } = useSession();
	const roomNameId = useId();
	const roomSlugId = useId();
	const roomDescriptionId = useId();
	const basePriceId = useId();
	const icalUrlId = useId();
	const [rooms, setRooms] = useState<Room[]>([]);
	const [loading, setLoading] = useState(true);
	const [editMode, setEditMode] = useState<EditMode>('none');
	const [editingRoom, setEditingRoom] = useState<Room | null>(null);
	const [formData, setFormData] = useState<RoomFormData>({
		name: '',
		slug: '',
		description: '',
		basePrice: 0,
		status: 'active',
		isActive: true,
	});

	// Calendar management state
	const [editingCalendar, setEditingCalendar] = useState<{
		roomId: string;
		provider: CalendarProvider;
	} | null>(null);
	const [newIcalUrl, setNewIcalUrl] = useState('');
	const [testingUrl, setTestingUrl] = useState<string | null>(null);
	const [testResult, setTestResult] = useState<TestResult | null>(null);

	// Load rooms function
	const loadRooms = useCallback(async () => {
		try {
			setLoading(true);
			const inputParam = encodeURIComponent(JSON.stringify({ limit: 100 }));
			const response = await fetch(`/api/trpc/rooms.list?input=${inputParam}`, {
				method: 'GET',
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error('API Error:', errorText);
				throw new Error('Failed to fetch rooms');
			}

			const data = (await response.json()) as {
				result: { data: { rooms: Room[] } };
			};
			setRooms(data.result.data.rooms || []);
		} catch (error) {
			console.error('Failed to load rooms:', error);
		} finally {
			setLoading(false);
		}
	}, []);

	// Load rooms on component mount
	useEffect(() => {
		loadRooms();
	}, [loadRooms]);

	// Room CRUD operations
	const handleAddRoom = () => {
		setEditMode('add');
		setFormData({
			name: '',
			slug: '',
			description: '',
			basePrice: 0,
			status: 'active',
			isActive: true,
		});
	};

	const handleEditRoom = (room: Room) => {
		setEditMode('edit');
		setEditingRoom(room);
		setFormData({
			name: room.name,
			slug: room.slug,
			description: room.description || '',
			basePrice: room.basePrice,
			status: room.status || 'active', // Default to active if missing
			isActive: room.isActive ?? true, // Default to true if null
		});
	};

	const handleSaveRoom = async () => {
		try {
			if (editMode === 'add') {
				// Create new room
				const response = await fetch('/api/trpc/rooms.create', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(formData),
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error('Create room error:', errorText);
					throw new Error('Failed to add room');
				}
			} else if (editingRoom) {
				// Update existing room
				const response = await fetch('/api/trpc/rooms.update', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						id: editingRoom.id,
						...formData,
					}),
				});

				if (!response.ok) {
					const errorText = await response.text();
					console.error('Update room error:', errorText);
					throw new Error('Failed to update room');
				}
			}

			await loadRooms();
			setEditMode('none');
			setEditingRoom(null);
		} catch (error) {
			console.error(`Failed to ${editMode} room:`, error);
		}
	};

	const handleCancelEdit = () => {
		setEditMode('none');
		setEditingRoom(null);
	};

	// Calendar management functions
	const handleEditCalendar = (roomId: string, provider: CalendarProvider) => {
		const room = rooms.find((r) => r.id === roomId);
		if (room) {
			setEditingCalendar({ roomId, provider });
			setNewIcalUrl(
				provider === 'airbnb'
					? room.airbnbIcalUrl || ''
					: room.expediaIcalUrl || '',
			);
		}
	};

	const handleSaveIcalUrl = async () => {
		if (!editingCalendar) return;

		try {
			const input = JSON.stringify({
				roomId: editingCalendar.roomId,
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

			await loadRooms();
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

	const handleSyncCalendar = async (
		roomId: string,
		provider: CalendarProvider,
	) => {
		try {
			const input = JSON.stringify({ roomId, platform: provider });

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

			await loadRooms();
		} catch (error) {
			console.error('Failed to sync calendar:', error);
		}
	};

	const handleRemoveIcalUrl = async (
		roomId: string,
		provider: CalendarProvider,
	) => {
		try {
			const input = JSON.stringify({
				roomId,
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

			await loadRooms();
		} catch (error) {
			console.error('Failed to remove iCal URL:', error);
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

	return (
		<div className="container mx-auto px-4 py-8">
			<div className="mb-6">
				<Link
					to="/admin"
					className="inline-flex items-center text-blue-600 hover:underline mb-4"
				>
					<ArrowLeft className="h-4 w-4 mr-2" />
					Back to Admin
				</Link>
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-3xl font-bold flex items-center gap-2">
							<Home className="h-8 w-8" />
							Property Management
						</h1>
						<p className="text-gray-600 mt-2">
							Manage your rooms and calendar integrations
						</p>
					</div>
					<Button onClick={handleAddRoom} className="flex items-center gap-2">
						<Plus className="h-4 w-4" />
						Add Room
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="text-center py-8">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
					<p className="mt-2 text-gray-600">Loading rooms...</p>
				</div>
			) : (
				<>
					{/* Room Form Modal */}
					{editMode !== 'none' && (
						<Card className="mb-6">
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									{editMode === 'add' ? (
										<Plus className="h-5 w-5" />
									) : (
										<Edit className="h-5 w-5" />
									)}
									{editMode === 'add' ? 'Add New Room' : 'Edit Room'}
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div>
									<label
										htmlFor={roomNameId}
										className="block text-sm font-medium mb-1"
									>
										Room Name
									</label>
									<Input
										id={roomNameId}
										value={formData.name}
										onChange={(e) => handleNameChange(e.target.value)}
										placeholder="e.g., Rose Room"
									/>
								</div>
								<div>
									<label
										htmlFor={roomSlugId}
										className="block text-sm font-medium mb-1"
									>
										Slug
									</label>
									<Input
										id={roomSlugId}
										value={formData.slug}
										onChange={(e) =>
											setFormData((prev) => ({ ...prev, slug: e.target.value }))
										}
										placeholder="e.g., rose-room"
									/>
								</div>
								<div>
									<label
										htmlFor={roomDescriptionId}
										className="block text-sm font-medium mb-1"
									>
										Description
									</label>
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
								<div>
									<label
										htmlFor={basePriceId}
										className="block text-sm font-medium mb-1"
									>
										Base Price ($)
									</label>
									<Input
										id={basePriceId}
										type="number"
										step="0.01"
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
								<div className="flex items-center gap-2">
									<div className="text-sm font-medium">Change Room Status:</div>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button variant="outline" className="capitalize">
												{formData.status}
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent>
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
								<div className="flex gap-2">
									<Button onClick={handleSaveRoom}>
										{editMode === 'add' ? 'Add Room' : 'Save Changes'}
									</Button>
									<Button variant="outline" onClick={handleCancelEdit}>
										Cancel
									</Button>
								</div>
							</CardContent>
						</Card>
					)}

					{/* Rooms List */}
					<div className="space-y-6">
						{rooms.length === 0 ? (
							<Card>
								<CardContent className="text-center py-8">
									<Home className="h-12 w-12 mx-auto text-gray-400 mb-4" />
									<h3 className="text-lg font-medium text-gray-900 mb-2">
										No rooms found
									</h3>
									<p className="text-gray-500 mb-4">
										Get started by adding your first room.
									</p>
									<Button
										onClick={handleAddRoom}
										className="flex items-center gap-2"
									>
										<Plus className="h-4 w-4" />
										Add Your First Room
									</Button>
								</CardContent>
							</Card>
						) : (
							rooms.map((room) => (
								<Card key={room.id}>
									<CardHeader>
										<div className="flex items-center justify-between">
											<div>
												<CardTitle className="flex items-center gap-2">
													{room.name}
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
												<p className="text-gray-600 text-sm">/{room.slug}</p>
												{room.description && (
													<p className="text-gray-500 text-sm mt-1">
														{room.description}
													</p>
												)}
											</div>
											<div className="flex gap-2">
												<Button
													variant="outline"
													size="sm"
													onClick={() => handleEditRoom(room)}
													className="flex items-center gap-1"
												>
													<Edit className="h-4 w-4" />
													Edit
												</Button>
											</div>
										</div>
									</CardHeader>
									<CardContent>
										<div className="space-y-4">
											<h4 className="font-medium flex items-center gap-2">
												<Calendar className="h-4 w-4" />
												Calendar Integrations
											</h4>

											{/* AirBnB Integration */}
											<div className="border rounded-lg p-4">
												<div className="flex items-center justify-between mb-3">
													<div className="flex items-center gap-2">
														<h5 className="font-medium">AirBnB</h5>
														{room.airbnbIcalUrl ? (
															<Badge variant="secondary">Configured</Badge>
														) : (
															<Badge variant="destructive">
																Not Configured
															</Badge>
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
																	onClick={() =>
																		handleSyncCalendar(room.id, 'airbnb')
																	}
																	className="flex items-center gap-1"
																>
																	<RefreshCw className="h-3 w-3" />
																	Sync
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() =>
																		handleRemoveIcalUrl(room.id, 'airbnb')
																	}
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
															onClick={() =>
																handleEditCalendar(room.id, 'airbnb')
															}
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
																	{new Date(
																		room.lastAirbnbSync,
																	).toLocaleString()}
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
															<Badge variant="destructive">
																Not Configured
															</Badge>
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
																	onClick={() =>
																		handleSyncCalendar(room.id, 'expedia')
																	}
																	className="flex items-center gap-1"
																>
																	<RefreshCw className="h-3 w-3" />
																	Sync
																</Button>
																<Button
																	variant="outline"
																	size="sm"
																	onClick={() =>
																		handleRemoveIcalUrl(room.id, 'expedia')
																	}
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
															onClick={() =>
																handleEditCalendar(room.id, 'expedia')
															}
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
																	{new Date(
																		room.lastExpediaSync,
																	).toLocaleString()}
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
														<span className="text-sm text-gray-600">
															By ID:
														</span>
														<code className="text-sm bg-gray-100 px-2 py-1 rounded">
															/api/rooms/{room.id}/calendar.ics
														</code>
													</div>
													<div className="flex items-center gap-2">
														<ExternalLink className="h-3 w-3 text-gray-400" />
														<span className="text-sm text-gray-600">
															By Slug:
														</span>
														<code className="text-sm bg-gray-100 px-2 py-1 rounded">
															/api/rooms/slug/{room.slug}/calendar.ics
														</code>
													</div>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							))
						)}
					</div>

					{/* iCal URL Edit Modal */}
					{editingCalendar && (
						<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
							<Card className="w-full max-w-md">
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Settings className="h-5 w-5" />
										Configure{' '}
										{editingCalendar.provider === 'airbnb'
											? 'AirBnB'
											: 'Expedia'}{' '}
										iCal URL
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div>
										<label
											htmlFor={icalUrlId}
											className="block text-sm font-medium mb-1"
										>
											iCal URL
										</label>
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
												<span className="text-green-700">
													Calendar is valid!
												</span>
											</div>
											{testResult.eventCount !== undefined && (
												<p className="text-sm text-gray-600">
													Found {testResult.eventCount} events
												</p>
											)}
											{testResult.nextEvent && (
												<div className="bg-gray-50 p-3 rounded">
													<h5 className="font-medium text-sm mb-1">
														Next Event:
													</h5>
													<p className="text-sm">
														{testResult.nextEvent.summary}
													</p>
													<p className="text-xs text-gray-500">
														{new Date(
															testResult.nextEvent.start,
														).toLocaleString()}{' '}
														-{' '}
														{new Date(
															testResult.nextEvent.end,
														).toLocaleString()}
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
												<p className="text-sm text-red-600">
													{testResult.error}
												</p>
											)}
										</div>
									)}
									<Button
										onClick={() => setTestResult(null)}
										className="w-full"
									>
										Close
									</Button>
								</CardContent>
							</Card>
						</div>
					)}
				</>
			)}
		</div>
	);
}
