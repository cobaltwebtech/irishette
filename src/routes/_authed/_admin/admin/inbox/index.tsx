import { Icon } from '@iconify/react';
import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { RowSelectionState } from '@tanstack/react-table';
import { type FormEvent, useEffect, useState } from 'react';

import { AdminLayout } from '@/components/admin/AdminLayout';
import {
	formatInboxDate,
	InboxKindLabel,
	InboxSourceBadge,
	UnreadDot,
} from '@/components/admin/inbox/inbox-ui';
import {
	useDeleteInboxItems,
	useSetInboxStatus,
} from '@/components/admin/inbox/use-inbox';
import {
	createServerColumnHelper,
	DataTableView,
	useServerTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import {
	INBOX_SOURCE_LABELS,
	type InboxSource,
	inboxSources,
} from '@/lib/inbox/inbox';
import {
	INBOX_PAGE_SIZES,
	type InboxView,
	inboxSearchSchema,
} from '@/lib/inbox/inbox-validation';
import { cn } from '@/utils/twMerge';

type Row = RouterOutputs['inbox']['adminList']['items'][number];
type Search = ReturnType<typeof inboxSearchSchema.parse>;

const DEFAULT_PAGE_SIZE = 25;

/** adminList input for the URL's search params. */
function listInput(search: Search) {
	return {
		...filtersInput(search),
		pageSize: search.pageSize ?? DEFAULT_PAGE_SIZE,
		cursor: search.cursor,
		direction: search.dir ?? 'next',
	};
}

/** adminCount input: the filters only, so paging does not recount. */
function filtersInput(search: Search) {
	return {
		view: search.view ?? 'inbox',
		source: search.source,
		kind: search.kind,
		search: search.q,
	};
}

export const Route = createFileRoute('/_authed/_admin/admin/inbox/')({
	head: () => ({
		meta: [{ title: 'Notifications | Irishette.com' }],
	}),
	validateSearch: inboxSearchSchema,
	loaderDeps: ({ search }) => search,
	// Auth: the _admin layout. The page and its count are preloaded for SSR.
	loader: async ({ context, deps }) => {
		await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.inbox.adminList.queryOptions(listInput(deps)),
			),
			context.queryClient.prefetchQuery(
				context.trpc.inbox.adminCount.queryOptions(filtersInput(deps)),
			),
		]);
	},
	component: InboxPage,
});

const VIEWS: Array<{ value: InboxView; label: string }> = [
	{ value: 'inbox', label: 'Inbox' },
	{ value: 'new', label: 'Unread' },
	{ value: 'archived', label: 'Archived' },
];

const columnHelper = createServerColumnHelper<Row>();

/** Keeps a click on a link or checkbox from opening the row. */
const stop = (event: { stopPropagation: () => void }) =>
	event.stopPropagation();

const columns = columnHelper.columns([
	columnHelper.display({
		id: 'select',
		header: ({ table }) => (
			<Checkbox
				aria-label="Select all on this page"
				checked={table.getIsAllRowsSelected()}
				indeterminate={
					!table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()
				}
				onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
			/>
		),
		cell: ({ row }) => (
			<Checkbox
				aria-label={`Select "${row.original.title}"`}
				checked={row.getIsSelected()}
				onCheckedChange={(value) => row.toggleSelected(!!value)}
				onClick={stop}
			/>
		),
	}),
	columnHelper.accessor('title', {
		header: 'Notification',
		cell: ({ row }) => {
			const item = row.original;
			const unread = item.status === 'new';
			return (
				<div className="flex max-w-xl min-w-64 items-start gap-2">
					<span className="pt-1.5">
						<UnreadDot unread={unread} />
					</span>
					<div className="min-w-0 space-y-0.5">
						<div className="flex items-center gap-2">
							<span className={cn('truncate', unread && 'font-semibold')}>
								{item.title}
							</span>
							{item.occurrences > 1 && (
								<Badge variant="secondary" title="Times reported">
									×{item.occurrences}
								</Badge>
							)}
						</div>
						<p className="truncate text-sm text-muted-foreground">
							{item.summary}
						</p>
					</div>
				</div>
			);
		},
	}),
	columnHelper.accessor('source', {
		header: 'Source',
		cell: ({ row }) => (
			<div className="flex flex-col items-start gap-1">
				<InboxSourceBadge source={row.original.source} />
				<InboxKindLabel kind={row.original.kind} />
			</div>
		),
	}),
	columnHelper.display({
		id: 'links',
		header: 'Booking / guest',
		cell: ({ row }) => {
			const { booking, guest } = row.original;
			if (!booking && !guest) {
				return <span className="text-muted-foreground">—</span>;
			}
			return (
				<div className="flex flex-col gap-0.5 text-sm">
					{booking && (
						<Link
							to="/admin/bookings/$publicId"
							params={{ publicId: booking.publicId }}
							onClick={stop}
							className="font-mono text-primary hover:underline"
						>
							{booking.confirmationId}
						</Link>
					)}
					{guest && (
						<Link
							to="/admin/guest/$publicId"
							params={{ publicId: guest.publicId }}
							onClick={stop}
							className="text-primary hover:underline"
						>
							{guest.name}
						</Link>
					)}
				</div>
			);
		},
	}),
	columnHelper.accessor('surfacedAt', {
		header: 'Date',
		cell: (info) => (
			<span className="text-sm whitespace-nowrap text-muted-foreground">
				{formatInboxDate(info.getValue())}
			</span>
		),
	}),
]);

/**
 * The current page (kept on screen while the next one loads), the total for
 * the filters, and a prefetch of the older page so "Older" is instant.
 */
function useInboxList(search: Search) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const input = listInput(search);
	const { data, isFetching } = useQuery({
		...trpc.inbox.adminList.queryOptions(input),
		placeholderData: keepPreviousData,
	});
	const { data: count } = useQuery({
		...trpc.inbox.adminCount.queryOptions(filtersInput(search)),
		placeholderData: keepPreviousData,
	});
	const nextCursor = data?.nextCursor ?? undefined;
	// Runs after every render; prefetchQuery does nothing while the page is
	// cached and fresh (staleTime 60 s in src/router.tsx).
	useEffect(() => {
		if (!nextCursor) return;
		void queryClient.prefetchQuery(
			trpc.inbox.adminList.queryOptions({
				...input,
				cursor: nextCursor,
				direction: 'next',
			}),
		);
	});
	return {
		items: data?.items ?? [],
		total: count?.total,
		isFetching,
		nextCursor,
		prevCursor: data?.prevCursor ?? undefined,
	};
}

function InboxPage() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: Route.fullPath });
	const input = listInput(search);
	const view = input.view;
	const { items, total, isFetching, nextCursor, prevCursor } =
		useInboxList(search);

	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const table = useServerTable({
		data: items,
		columns,
		getRowId: (row) => row.publicId,
		state: { rowSelection },
		onRowSelectionChange: setRowSelection,
	});
	const selected = Object.keys(rowSelection).filter((id) => rowSelection[id]);

	const setStatus = useSetInboxStatus();
	const remove = useDeleteInboxItems();
	const [confirmDelete, setConfirmDelete] = useState(false);

	/** Changes filters or the page; selection never carries across pages. */
	function go(next: Partial<Search>) {
		setRowSelection({});
		void navigate({ search: (prev) => ({ ...prev, ...next }) });
	}

	/** A new filter starts again at the newest page. */
	function filter(next: Partial<Search>) {
		go({ ...next, cursor: undefined, dir: undefined });
	}

	function changeStatus(status: StatusAction) {
		setStatus.mutate({ publicIds: selected, status });
		setRowSelection({});
	}

	function deleteSelected() {
		remove.mutate(
			{ publicIds: selected },
			{
				onSuccess: () => {
					setRowSelection({});
					setConfirmDelete(false);
				},
			},
		);
	}

	return (
		<AdminLayout title="Notifications">
			<p className="text-muted-foreground">
				Stripe and system events, and messages from the contact form. Items stay
				until you delete them.
			</p>

			<Card className="max-w-full overflow-hidden">
				<CardHeader className="space-y-4">
					<InboxFilters search={search} view={view} onFilter={filter} />
					{selected.length > 0 && (
						<BulkActions
							count={selected.length}
							archived={view === 'archived'}
							onStatus={changeStatus}
							onDelete={() => setConfirmDelete(true)}
						/>
					)}
				</CardHeader>
				<CardContent className={cn(isFetching && 'opacity-70')}>
					<ScrollArea className="w-full">
						<DataTableView
							table={table}
							emptyMessage="No notifications."
							rowClassName={(row) =>
								row.status === 'new' ? 'bg-primary/5' : undefined
							}
							onRowClick={(row) =>
								navigate({
									to: '/admin/inbox/$publicId',
									params: { publicId: row.publicId },
								})
							}
						/>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
					<Pager
						total={total}
						pageSize={input.pageSize}
						onPageSize={(pageSize) => filter({ pageSize })}
						onNewer={
							prevCursor
								? () => go({ cursor: prevCursor, dir: 'prev' })
								: undefined
						}
						onOlder={
							nextCursor
								? () => go({ cursor: nextCursor, dir: undefined })
								: undefined
						}
					/>
				</CardContent>
			</Card>

			<ConfirmDeleteDialog
				open={confirmDelete}
				onOpenChange={setConfirmDelete}
				count={selected.length}
				pending={remove.isPending}
				onConfirm={deleteSelected}
			/>
		</AdminLayout>
	);
}

function SourceButton({
	label,
	active,
	onClick,
}: {
	label: string;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<Button
			size="sm"
			variant={active ? 'secondary' : 'ghost'}
			aria-pressed={active}
			onClick={onClick}
		>
			{label}
		</Button>
	);
}

type StatusAction = 'new' | 'read' | 'archived' | 'unarchived';

function BulkActions({
	count,
	archived,
	onStatus,
	onDelete,
}: {
	count: number;
	archived: boolean;
	onStatus: (status: StatusAction) => void;
	onDelete: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2">
			<span className="px-1 text-sm font-medium">{count} selected</span>
			<Button size="sm" variant="outline" onClick={() => onStatus('read')}>
				<Icon icon="tabler:mail-opened" className="size-4" />
				Mark read
			</Button>
			<Button size="sm" variant="outline" onClick={() => onStatus('new')}>
				<Icon icon="tabler:mail" className="size-4" />
				Mark unread
			</Button>
			<Button
				size="sm"
				variant="outline"
				onClick={() => onStatus(archived ? 'unarchived' : 'archived')}
			>
				<Icon
					icon={archived ? 'tabler:inbox' : 'tabler:archive'}
					className="size-4"
				/>
				{archived ? 'Move to inbox' : 'Archive'}
			</Button>
			<Button size="sm" variant="destructive" onClick={onDelete}>
				<Icon icon="tabler:trash" className="size-4" />
				Delete
			</Button>
		</div>
	);
}

/** Total, page size and keyset "Newer" / "Older" (no page numbers). */
function Pager({
	total,
	pageSize,
	onPageSize,
	onNewer,
	onOlder,
}: {
	total: number | undefined;
	pageSize: number;
	onPageSize: (pageSize: Search['pageSize']) => void;
	/** Undefined: no newer / older page. */
	onNewer?: () => void;
	onOlder?: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 py-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				{total !== undefined && <span>{total} total ·</span>}
				<label className="flex items-center gap-1">
					Per page
					<select
						className="rounded-md border bg-background px-2 py-1"
						value={pageSize}
						onChange={(event) =>
							onPageSize(Number(event.target.value) as Search['pageSize'])
						}
					>
						{INBOX_PAGE_SIZES.map((size) => (
							<option key={size} value={size}>
								{size}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className="space-x-2">
				<Button
					variant="outline"
					size="sm"
					disabled={!onNewer}
					onClick={onNewer}
				>
					Newer
				</Button>
				<Button
					variant="outline"
					size="sm"
					disabled={!onOlder}
					onClick={onOlder}
				>
					Older
				</Button>
			</div>
		</div>
	);
}

/** Views (Inbox / Unread / Archived), the search box and the source filter. */
function InboxFilters({
	search,
	view,
	onFilter,
}: {
	search: Search;
	view: InboxView;
	onFilter: (next: Partial<Search>) => void;
}) {
	const [query, setQuery] = useState(search.q ?? '');

	function submitSearch(event: FormEvent) {
		event.preventDefault();
		onFilter({ q: query.trim() || undefined });
	}

	return (
		<>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<nav aria-label="Views" className="flex gap-1">
					{VIEWS.map((v) => (
						<Button
							key={v.value}
							size="sm"
							variant={view === v.value ? 'default' : 'ghost'}
							aria-current={view === v.value ? 'page' : undefined}
							onClick={() =>
								onFilter({ view: v.value === 'inbox' ? undefined : v.value })
							}
						>
							{v.label}
						</Button>
					))}
				</nav>
				<form onSubmit={submitSearch} className="relative">
					<Icon
						icon="tabler:search"
						className="absolute top-1/2 left-2 size-5 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						aria-label="Search notifications"
						placeholder="Search title or summary..."
						value={query}
						maxLength={100}
						onChange={(event) => setQuery(event.target.value)}
						className="w-70 pl-8"
					/>
				</form>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm text-muted-foreground">Source:</span>
				<SourceButton
					label="All"
					active={!search.source}
					onClick={() => onFilter({ source: undefined })}
				/>
				{inboxSources.map((source) => (
					<SourceButton
						key={source}
						label={INBOX_SOURCE_LABELS[source]}
						active={search.source === source}
						onClick={() => onFilter({ source: source as InboxSource })}
					/>
				))}
			</div>
		</>
	);
}

function ConfirmDeleteDialog({
	open,
	onOpenChange,
	count,
	pending,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	count: number;
	pending: boolean;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						Delete {count} {count === 1 ? 'notification' : 'notifications'}?
					</DialogTitle>
					<DialogDescription>
						This cannot be undone. Bookings and payments are not affected.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button variant="destructive" disabled={pending} onClick={onConfirm}>
						Delete
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
