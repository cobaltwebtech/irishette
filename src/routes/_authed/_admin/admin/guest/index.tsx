import { Icon } from '@iconify/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	createAppColumnHelper,
	DataTableCard,
	sortable,
	useAppTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import { formatDateCT } from '@/lib/timezone';

type GuestRow = RouterOutputs['users']['adminListGuests']['guests'][number];

const GUESTS_INPUT = { limit: 100, offset: 0 };

const columnHelper = createAppColumnHelper<GuestRow>();

const columns = columnHelper.columns([
	columnHelper.accessor('user.name', {
		header: sortable('Guest Name'),
		cell: (info) => (
			<div className="flex items-center gap-2">
				<Icon
					icon="tabler:user-circle"
					className="size-5 text-muted-foreground"
				/>
				<div>
					<div className="font-medium">{info.getValue()}</div>
					<div className="text-xs text-muted-foreground">
						Member since {formatDateCT(info.row.original.user.createdAt)}
					</div>
				</div>
			</div>
		),
	}),
	columnHelper.accessor('user.email', {
		header: sortable('Email'),
		cell: (info) => (
			<a
				href={`mailto:${info.getValue()}`}
				className="text-primary hover:underline"
			>
				{info.getValue()}
			</a>
		),
	}),
	columnHelper.accessor('user.phoneNumber', {
		header: 'Phone',
		cell: (info) => {
			const phone = info.getValue();
			return phone ? (
				<a href={`tel:${phone}`} className="text-primary hover:underline">
					{phone}
				</a>
			) : (
				<span className="text-muted-foreground">N/A</span>
			);
		},
	}),
	columnHelper.accessor('bookingCount', {
		header: sortable('Bookings'),
		cell: (info) => {
			const count = info.getValue();
			return (
				<div className="flex items-center gap-2">
					<Badge variant={count > 0 ? 'default' : 'secondary'}>{count}</Badge>
					{count > 1 && (
						<Badge variant="outline" className="text-xs">
							<Icon icon="tabler:star" className="size-4 text-accent" />
							Repeat Guest
						</Badge>
					)}
				</div>
			);
		},
	}),
]);

export const Route = createFileRoute('/_authed/_admin/admin/guest/')({
	head: () => ({
		meta: [
			{
				title: 'Guest Management | Irishette.com',
			},
		],
	}),
	// Auth: the _admin layout. Guests are preloaded for SSR.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(
			context.trpc.users.adminListGuests.queryOptions(GUESTS_INPUT),
		),
	component: AdminGuests,
});

function AdminGuests() {
	const navigate = useNavigate();
	const trpc = useTRPC();

	const { data: guestsResponse } = useSuspenseQuery(
		trpc.users.adminListGuests.queryOptions(GUESTS_INPUT),
	);

	const table = useAppTable({
		data: guestsResponse.guests,
		columns,
	});

	return (
		<AdminLayout title="Guest Management">
			<div className="mb-6">
				<p className="text-muted-foreground">
					View and manage all registered guests and their booking history
				</p>
			</div>

			<DataTableCard
				table={table}
				title="All Guests"
				searchPlaceholder="Search guests..."
				searchClassName="w-[300px]"
				searchIconClassName="size-5"
				emptyMessage="No guests found."
				noun="guests"
				scroll
				className="max-w-full overflow-hidden"
				onRowClick={(guest) =>
					navigate({
						to: '/admin/guest/$publicId',
						params: { publicId: guest.user.publicId },
					})
				}
			/>
		</AdminLayout>
	);
}
