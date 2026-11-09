import { Icon } from '@iconify/react';
import { useId } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SITE_URL } from '@/lib/site';
import { formatDateCT } from '@/lib/timezone';

interface RoomDetailsProps {
	name: string;
	slug: string;
	description: string;
	status: 'active' | 'inactive' | 'archived';
	isActive: boolean;
	roomId: string;
	createdAt: Date;
	updatedAt: Date;
	onNameChange: (name: string) => void;
	onSlugChange: (slug: string) => void;
	onDescriptionChange: (description: string) => void;
	onStatusChange: (isActive: boolean) => void;
}

export function RoomDetails({
	name,
	slug,
	description,
	status,
	isActive,
	roomId,
	createdAt,
	updatedAt,
	onNameChange,
	onSlugChange,
	onDescriptionChange,
	onStatusChange,
}: RoomDetailsProps) {
	const roomNameId = useId();
	const roomSlugId = useId();
	const roomDescriptionId = useId();

	return (
		<Card className="lg:col-span-2">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Icon icon="tabler:clipboard-data" className="size-6" />
					Room Details
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<div className="grid gap-6 md:grid-cols-2">
					<div>
						<Label htmlFor={roomNameId} className="mb-2 text-sm font-medium">
							Room Name
						</Label>
						<Input
							id={roomNameId}
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="e.g., Rose Room"
						/>
					</div>
					<div>
						<Label htmlFor={roomSlugId} className="mb-2 text-sm font-medium">
							Slug
						</Label>
						<Input
							id={roomSlugId}
							value={slug}
							onChange={(e) => onSlugChange(e.target.value)}
							placeholder="e.g., rose-room"
						/>
					</div>
				</div>

				<div>
					<Label
						htmlFor={roomDescriptionId}
						className="mb-2 text-sm font-medium"
					>
						Description
					</Label>
					<Input
						id={roomDescriptionId}
						value={description}
						onChange={(e) => onDescriptionChange(e.target.value)}
						placeholder="Room description (optional)"
					/>
				</div>

				<div className="grid gap-6 md:grid-cols-3">
					<div>
						<div className="mb-2 text-sm font-medium">Room Status</div>
						<div className="flex items-center gap-3">
							<Switch
								checked={isActive}
								onCheckedChange={onStatusChange}
								aria-label="Toggle room active status"
							/>
							<span className="text-sm capitalize">{status}</span>
						</div>
					</div>
				</div>

				{/* Room metadata */}
				<div className="border-t pt-6">
					<h3 className="mb-4 font-semibold">Room Information</h3>
					<div className="flex flex-wrap gap-8 text-sm">
						<div>
							Room ID: <span className="font-mono font-semibold">{roomId}</span>
						</div>
						<div>
							Created:{' '}
							<span className="font-mono font-semibold">
								{formatDateCT(createdAt)}
							</span>
						</div>
						<div>
							Last Updated:{' '}
							<span className="font-mono font-semibold">
								{formatDateCT(updatedAt)}
							</span>
						</div>
						<div>
							Public URL:{' '}
							<span className="font-mono font-semibold">
								{SITE_URL}/rooms/{slug}
							</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
