import { Icon } from '@iconify/react';
import {
	type CellData,
	type Column,
	columnFilteringFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	createTableHook,
	FlexRender,
	filterFn_includesString,
	globalFilteringFeature,
	type ReactTable,
	type RowData,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_datetime,
	sortFn_text,
	type TableFeatures,
	tableFeatures,
	type TableOptions,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/utils/twMerge';

/**
 * Shared TanStack Table v9 setup for every data table in the app: sorting,
 * a global text search and client-side pagination. Only the sort/filter
 * functions the tables actually use are registered ('auto' resolves among
 * these).
 */
const dataTableFeatures = tableFeatures({
	rowSortingFeature,
	// Required by globalFilteringFeature; no per-column filter UI exists.
	columnFilteringFeature,
	globalFilteringFeature,
	rowPaginationFeature,
	sortedRowModel: createSortedRowModel(),
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		basic: sortFn_basic,
		datetime: sortFn_datetime,
		text: sortFn_text,
	},
	filterFns: { includesString: filterFn_includesString },
});

export type DataTableFeatures = typeof dataTableFeatures;
export type DataTable<TData extends RowData> = ReactTable<
	DataTableFeatures,
	TData
>;

/** Options for `useAppTable` (`data`, `columns`, `initialState`, ...). */
export type DataTableOptions<TData extends RowData> = Omit<
	TableOptions<DataTableFeatures, TData>,
	'features'
>;

/**
 * `useAppTable({ data, columns, initialState? })` and
 * `createAppColumnHelper<Row>()`. Define columns at module scope.
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
	features: dataTableFeatures,
});

/**
 * Tables whose rows are paged, filtered and sorted on the server (manual
 * mode): only row selection runs in the browser. `useServerTable({ data,
 * columns, getRowId, state: { rowSelection }, onRowSelectionChange })` and
 * `createServerColumnHelper<Row>()`.
 */
const serverTableFeatures = tableFeatures({ rowSelectionFeature });

export const {
	useAppTable: useServerTable,
	createAppColumnHelper: createServerColumnHelper,
} = createTableHook({ features: serverTableFeatures });

// The components below read table state through methods (getIsSorted,
// getRowModel, ...). The React Compiler cannot see those reads and could
// reuse stale output for a stable column/header object, so they opt out.

/** Header button that toggles sorting for its column. */
export function SortableHeader<TData extends RowData, TValue extends CellData>({
	column,
	children,
}: {
	column: Column<DataTableFeatures, TData, TValue>;
	children: ReactNode;
}) {
	'use no memo';
	const sorted = column.getIsSorted();
	return (
		<Button
			variant="ghost"
			onClick={() => column.toggleSorting(sorted === 'asc')}
		>
			{children}
			<Icon
				icon={
					sorted === 'asc'
						? 'tabler:arrow-up'
						: sorted === 'desc'
							? 'tabler:arrow-down'
							: 'tabler:arrows-up-down'
				}
			/>
		</Button>
	);
}

/** `header: sortable('Amount')`: a SortableHeader with a fixed label. */
export function sortable(label: string) {
	return function SortableLabel<
		TData extends RowData,
		TValue extends CellData,
	>({ column }: { column: Column<DataTableFeatures, TData, TValue> }) {
		return <SortableHeader column={column}>{label}</SortableHeader>;
	};
}

/** shadcn table body for a TanStack table, with an empty-state row. */
export function DataTableView<
	TFeatures extends TableFeatures,
	TData extends RowData,
>({
	table,
	emptyMessage = 'No results.',
	onRowClick,
	rowClassName,
}: {
	table: ReactTable<TFeatures, TData>;
	emptyMessage?: ReactNode;
	onRowClick?: (row: TData) => void;
	/** Extra classes per row (e.g. to highlight one). */
	rowClassName?: (row: TData) => string | undefined;
}) {
	'use no memo';
	const rows = table.getRowModel().rows;
	return (
		<Table>
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id}>
						{headerGroup.headers.map((header) => (
							<TableHead key={header.id}>
								{header.isPlaceholder ? null : <FlexRender header={header} />}
							</TableHead>
						))}
					</TableRow>
				))}
			</TableHeader>
			<TableBody>
				{rows.length ? (
					rows.map((row) => (
						<TableRow
							key={row.id}
							className={
								[
									onRowClick ? 'cursor-pointer' : undefined,
									rowClassName?.(row.original),
								]
									.filter(Boolean)
									.join(' ') || undefined
							}
							onClick={onRowClick ? () => onRowClick(row.original) : undefined}
						>
							{row.getAllCells().map((cell) => (
								<TableCell key={cell.id}>
									<FlexRender cell={cell} />
								</TableCell>
							))}
						</TableRow>
					))
				) : (
					<TableRow>
						<TableCell
							colSpan={table.getAllLeafColumns().length}
							className="h-24 text-center"
						>
							{emptyMessage}
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);
}

/**
 * "Showing x to y of N <noun>" with Previous / Next. Renders nothing when
 * everything fits on one page.
 */
export function PaginationControls<TData extends RowData>({
	table,
	noun = 'results',
}: {
	table: DataTable<TData>;
	noun?: string;
}) {
	'use no memo';
	if (table.getPageCount() <= 1) return null;
	const { pageIndex, pageSize } = table.state.pagination;
	const total = table.getFilteredRowModel().rows.length;
	return (
		<div className="flex items-center justify-between space-x-2 py-4">
			<div className="text-sm text-muted-foreground">
				Showing {pageIndex * pageSize + 1} to{' '}
				{Math.min((pageIndex + 1) * pageSize, total)} of {total} {noun}
			</div>
			<div className="space-x-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => table.previousPage()}
					disabled={!table.getCanPreviousPage()}
				>
					Previous
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => table.nextPage()}
					disabled={!table.getCanNextPage()}
				>
					Next
				</Button>
			</div>
		</div>
	);
}

export interface DataTableCardProps<TData extends RowData> {
	table: DataTable<TData>;
	/** Card title; the filtered row count is appended in parentheses. */
	title: ReactNode;
	description?: ReactNode;
	searchPlaceholder: string;
	/** Width of the search box, e.g. `w-[300px]`. */
	searchClassName: string;
	searchIconClassName?: string;
	/** Layout of the title/search row. */
	headerClassName?: string;
	emptyMessage: ReactNode;
	/** Pagination noun ("Showing 1 to 10 of 42 <noun>"). */
	noun: string;
	/** Wrap the table in a horizontal ScrollArea. */
	scroll?: boolean;
	className?: string;
	footer?: ReactNode;
	onRowClick?: (row: TData) => void;
}

/**
 * A client-side table in a card: title with the filtered row count, a
 * global search box, the table, pagination and an optional footer.
 */
export function DataTableCard<TData extends RowData>({
	table,
	title,
	description,
	searchPlaceholder,
	searchClassName,
	searchIconClassName = 'size-4',
	headerClassName = 'flex items-center justify-between',
	emptyMessage,
	noun,
	scroll = false,
	className,
	footer,
	onRowClick,
}: DataTableCardProps<TData>) {
	'use no memo';
	const cardTitle = (
		<CardTitle>
			{title} ({table.getFilteredRowModel().rows.length})
		</CardTitle>
	);
	const view = (
		<DataTableView
			table={table}
			emptyMessage={emptyMessage}
			onRowClick={onRowClick}
		/>
	);
	return (
		<Card className={className}>
			<CardHeader>
				<div className={headerClassName}>
					{description ? (
						<div>
							{cardTitle}
							<CardDescription>{description}</CardDescription>
						</div>
					) : (
						cardTitle
					)}
					<div className="relative">
						<Icon
							icon="tabler:search"
							className={cn(
								'absolute top-1/2 left-2 -translate-y-1/2 transform text-muted-foreground',
								searchIconClassName,
							)}
						/>
						<Input
							placeholder={searchPlaceholder}
							value={table.state.globalFilter ?? ''}
							onChange={(event) =>
								table.setGlobalFilter(String(event.target.value))
							}
							className={cn('pl-8', searchClassName)}
						/>
					</div>
				</div>
			</CardHeader>
			<CardContent>
				{scroll ? (
					<ScrollArea className="w-full">
						{view}
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				) : (
					view
				)}
				<PaginationControls table={table} noun={noun} />
			</CardContent>
			{footer && <CardFooter>{footer}</CardFooter>}
		</Card>
	);
}
