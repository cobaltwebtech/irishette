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
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';

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

/**
 * `useAppTable({ data, columns, initialState? })` and
 * `createAppColumnHelper<Row>()`. Define columns at module scope.
 */
export const { useAppTable, createAppColumnHelper } = createTableHook({
	features: dataTableFeatures,
});

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

/** shadcn table body for a TanStack table, with an empty-state row. */
export function DataTableView<TData extends RowData>({
	table,
	emptyMessage = 'No results.',
	onRowClick,
	rowClassName,
}: {
	table: DataTable<TData>;
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
