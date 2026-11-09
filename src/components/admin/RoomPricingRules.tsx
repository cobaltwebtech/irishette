import { Icon } from '@iconify/react';
import { isTRPCClientError } from '@trpc/client';
import { useId, useState } from 'react';

import {
	createAppColumnHelper,
	DataTableView,
	PaginationControls,
	SortableHeader,
	useAppTable,
} from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import type { TRPCRouter } from '@/integrations/trpc/router';
import type {
	CreatePricingRule,
	RoomPricingRule,
	UpdatePricingRule,
} from '@/lib/room-validation';

/** Overlap details from a CONFLICT error (data.conflict). */
interface RuleConflict {
	id: string;
	name: string;
	startDate: string;
	endDate: string;
}

/** Reads the server's structured error for the form. */
function readSaveError(error: unknown): {
	message: string;
	conflict: RuleConflict | null;
	fieldErrors: Record<string, string[] | undefined>;
} {
	if (isTRPCClientError<TRPCRouter>(error)) {
		return {
			message: error.message,
			conflict: (error.data?.conflict as RuleConflict | null) ?? null,
			fieldErrors: error.data?.zodError?.fieldErrors ?? {},
		};
	}
	return {
		message: error instanceof Error ? error.message : 'Unexpected error',
		conflict: null,
		fieldErrors: {},
	};
}

const formatRuleValue = (rule: RoomPricingRule) => {
	switch (rule.ruleType) {
		case 'surcharge_rate':
			return `+${(rule.value * 100).toFixed(1)}%`;
		case 'fixed_amount':
			return `+$${rule.value.toFixed(2)}`;
		case 'absolute_price':
			return `$${rule.value.toFixed(2)}`;
		default:
			return rule.value.toString();
	}
};

const calculateEffectivePrice = (rule: RoomPricingRule, basePrice: number) => {
	switch (rule.ruleType) {
		case 'surcharge_rate':
			return basePrice + basePrice * rule.value;
		case 'fixed_amount':
			return basePrice + rule.value;
		case 'absolute_price':
			return rule.value;
		default:
			return basePrice;
	}
};

const getRuleTypeLabel = (ruleType: string) => {
	switch (ruleType) {
		case 'surcharge_rate':
			return 'Surcharge %';
		case 'fixed_amount':
			return 'Fixed Amount';
		case 'absolute_price':
			return 'Absolute Price';
		default:
			return ruleType;
	}
};

const getRuleBadgeVariant = (ruleType: string) => {
	switch (ruleType) {
		case 'surcharge_rate':
			return 'default';
		case 'fixed_amount':
			return 'secondary';
		case 'absolute_price':
			return 'destructive';
		default:
			return 'outline';
	}
};

const formatDateRange = (startDate: string, endDate: string) => {
	// Parse dates without timezone issues by treating them as local dates
	const start = new Date(`${startDate}T00:00:00`).toLocaleDateString();
	const end = new Date(`${endDate}T00:00:00`).toLocaleDateString();
	return `${start} - ${end}`;
};

const columnHelper = createAppColumnHelper<RoomPricingRule>();

function makeColumns({
	basePrice,
	onEdit,
	onDelete,
}: {
	basePrice: number;
	onEdit: (rule: RoomPricingRule) => void;
	onDelete: (rule: RoomPricingRule) => void;
}) {
	return columnHelper.columns([
		columnHelper.accessor('startDate', {
			header: ({ column }) => (
				<SortableHeader column={column}>Date Range</SortableHeader>
			),
			cell: (info) => (
				<span className="text-sm">
					{formatDateRange(info.getValue(), info.row.original.endDate)}
				</span>
			),
		}),
		columnHelper.accessor('name', {
			header: 'Rule Name',
			cell: (info) => (
				<span
					id={`pricing-rule-${info.row.original.id}`}
					className="font-medium"
				>
					{info.getValue()}
				</span>
			),
		}),
		columnHelper.accessor('ruleType', {
			header: 'Type',
			cell: (info) => (
				<Badge variant={getRuleBadgeVariant(info.getValue())}>
					{getRuleTypeLabel(info.getValue())}
				</Badge>
			),
		}),
		columnHelper.accessor('value', {
			header: 'Value',
			cell: (info) => (
				<span className="font-mono">{formatRuleValue(info.row.original)}</span>
			),
		}),
		columnHelper.display({
			id: 'effectivePrice',
			header: 'Effective Price',
			cell: (info) => (
				<span className="font-semibold">
					${calculateEffectivePrice(info.row.original, basePrice).toFixed(2)}
				</span>
			),
		}),
		columnHelper.accessor('isActive', {
			header: 'Status',
			cell: (info) => (
				<Badge variant={info.getValue() ? 'default' : 'outline'}>
					{info.getValue() ? 'Active' : 'Inactive'}
				</Badge>
			),
		}),
		columnHelper.display({
			id: 'actions',
			header: 'Actions',
			cell: (info) => (
				<DropdownMenu>
					<DropdownMenuTrigger
						render={<Button variant="ghost" className="h-8 w-8 p-0" />}
					>
						<span className="sr-only">Open menu</span>
						<Icon icon="tabler:dots" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuLabel>Actions</DropdownMenuLabel>
							<DropdownMenuItem onClick={() => onEdit(info.row.original)}>
								<Icon icon="tabler:pencil" />
								Edit
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => onDelete(info.row.original)}
							className="text-destructive"
						>
							<Icon icon="tabler:trash" />
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
		}),
	]);
}

interface PricingRulesManagementProps {
	roomId: string;
	roomName: string;
	basePrice: number;
	pricingRules: RoomPricingRule[];
	onCreateRule: (rule: CreatePricingRule) => Promise<void>;
	onUpdateRule: (rule: UpdatePricingRule) => Promise<void>;
	onDeleteRule: (ruleId: string) => Promise<void>;
}

export function PricingRulesManagement({
	roomId,
	roomName,
	basePrice,
	pricingRules,
	onCreateRule,
	onUpdateRule,
	onDeleteRule,
}: PricingRulesManagementProps) {
	const [isCreating, setIsCreating] = useState(false);
	const [editingRule, setEditingRule] = useState<RoomPricingRule | null>(null);
	const [deletingRule, setDeletingRule] = useState<RoomPricingRule | null>(
		null,
	);
	// Rule highlighted after an overlap error ("Show rule").
	const [highlightId, setHighlightId] = useState<string | null>(null);

	// Only current and future rules are displayed
	const today = new Date();
	today.setHours(0, 0, 0, 0); // Reset time to start of day
	const filteredRules = pricingRules.filter(
		(rule) => new Date(`${rule.endDate}T00:00:00`) >= today,
	);

	const columns = makeColumns({
		basePrice,
		onEdit: setEditingRule,
		onDelete: setDeletingRule,
	});

	const table = useAppTable({
		data: filteredRules,
		columns,
		initialState: {
			sorting: [{ id: 'startDate', desc: false }],
		},
	});

	/** Closes the dialog, pages to the conflicting rule and highlights it. */
	const showRule = (id: string) => {
		setIsCreating(false);
		setEditingRule(null);
		setHighlightId(id);
		const index = table
			.getSortedRowModel()
			.rows.findIndex((row) => row.original.id === id);
		if (index >= 0) {
			table.setPageIndex(Math.floor(index / table.state.pagination.pageSize));
		}
		requestAnimationFrame(() =>
			document
				.getElementById(`pricing-rule-${id}`)
				?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
		);
	};

	return (
		<Card>
			<CardHeader className="flex justify-between gap-12">
				<div>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Icon icon="tabler:calendar-dollar" className="size-6" />
						Pricing Rules - {roomName}
					</CardTitle>
					<CardDescription>
						Base price: ${basePrice.toFixed(2)}/night. Manage dynamic pricing
						rules for different seasons, events, and conditions. Only current
						and future rules are displayed.
					</CardDescription>
				</div>
				<Button
					variant="secondary"
					onClick={() => setIsCreating(true)}
					size="sm"
				>
					<Icon icon="tabler:playlist-add" className="size-5" />
					Add Rule
				</Button>
			</CardHeader>
			<CardContent>
				{filteredRules.length === 0 ? (
					<div className="py-8 text-center text-muted-foreground">
						<Icon
							icon="tabler:calendar-cancel"
							className="mx-auto mb-4 size-12 text-secondary"
						/>
						<p className="text-lg font-medium">
							No current pricing rules for room
						</p>
						<p className="text-sm">
							Add a pricing rule to enable dynamic pricing for this room.
						</p>
					</div>
				) : (
					<>
						<DataTableView
							table={table}
							emptyMessage="No pricing rules found."
							rowClassName={(rule) =>
								rule.id === highlightId
									? 'bg-amber-100 ring-2 ring-amber-400 ring-inset'
									: undefined
							}
						/>
						<PaginationControls table={table} noun="rules" />
					</>
				)}

				{(isCreating || editingRule) && (
					<Dialog
						open={isCreating || !!editingRule}
						onOpenChange={(open) => {
							if (!open) {
								setIsCreating(false);
								setEditingRule(null);
							}
						}}
					>
						<PricingRuleForm
							roomId={roomId}
							rule={editingRule}
							onShowConflict={showRule}
							onSave={async (rule) => {
								if (editingRule?.id) {
									await onUpdateRule({ ...rule, id: editingRule.id });
									toast.add({
										type: 'success',
										title: 'Pricing rule updated successfully',
									});
									setEditingRule(null);
								} else {
									await onCreateRule(rule);
									toast.add({
										type: 'success',
										title: 'Pricing rule created successfully',
									});
									setIsCreating(false);
								}
								// No need to re-throw since success toasts and modal closing happen here
							}}
							onCancel={() => {
								setIsCreating(false);
								setEditingRule(null);
							}}
						/>
					</Dialog>
				)}

				{/* Delete Confirmation Dialog */}
				{deletingRule && (
					<Dialog
						open={!!deletingRule}
						onOpenChange={(open) => {
							if (!open) {
								setDeletingRule(null);
							}
						}}
					>
						<DialogContent className="max-w-md">
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<Icon
										icon="tabler:trash"
										className="size-5 text-destructive"
									/>
									Delete Pricing Rule
								</DialogTitle>
								<DialogDescription className="text-left">
									Are you sure you want to delete the pricing rule{' '}
									<strong>"{deletingRule.name}"</strong>?
									<br />
									This will permanently remove the rule for the date range{' '}
									<strong>
										{formatDateRange(
											deletingRule.startDate,
											deletingRule.endDate,
										)}
									</strong>
									.
									<br />
									This action cannot be undone.
								</DialogDescription>
							</DialogHeader>

							<div className="flex justify-end space-x-2 pt-4">
								<Button
									type="button"
									variant="outline"
									onClick={() => setDeletingRule(null)}
								>
									Cancel
								</Button>
								<Button
									type="button"
									variant="destructive"
									onClick={async () => {
										if (deletingRule.id) {
											try {
												await onDeleteRule(deletingRule.id);
												toast.add({
													type: 'success',
													title: 'Pricing rule deleted successfully',
												});
												setDeletingRule(null);
											} catch (error) {
												console.error('Failed to delete pricing rule:', error);
												toast.add({
													type: 'error',
													title: 'Failed to delete pricing rule',
												});
											}
										}
									}}
								>
									Delete
								</Button>
							</div>
						</DialogContent>
					</Dialog>
				)}
			</CardContent>
		</Card>
	);
}

interface PricingRuleFormProps {
	roomId: string;
	rule?: RoomPricingRule | null;
	onSave: (rule: CreatePricingRule) => Promise<void>;
	onCancel: () => void;
	onShowConflict: (ruleId: string) => void;
}

function PricingRuleForm({
	roomId,
	rule,
	onSave,
	onCancel,
	onShowConflict,
}: PricingRuleFormProps) {
	const formId = useId();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [conflict, setConflict] = useState<RuleConflict | null>(null);
	const [fieldErrors, setFieldErrors] = useState<
		Record<string, string[] | undefined>
	>({});

	// Today (local) as YYYY-MM-DD, for the date inputs' min.
	const now = new Date();
	const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

	const [formData, setFormData] = useState<CreatePricingRule>({
		roomId,
		name: rule?.name || '',
		ruleType: rule?.ruleType || 'surcharge_rate',
		value: rule?.value || 0,
		startDate: rule?.startDate || '',
		endDate: rule?.endDate || '',
		isActive: rule?.isActive ?? true,
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Basic validation
		if (!formData.name.trim()) {
			toast.add({ type: 'error', title: 'Rule name is required' });
			return;
		}

		if (!formData.startDate || !formData.endDate) {
			toast.add({ type: 'error', title: 'Start and end dates are required' });
			return;
		}

		// Inclusive dates: a single-night rule has start = end.
		if (formData.endDate < formData.startDate) {
			toast.add({
				type: 'error',
				title: 'End date must be on or after the start date',
			});
			return;
		}

		if (formData.endDate < today) {
			toast.add({ type: 'error', title: 'End date cannot be in the past' });
			return;
		}

		if (formData.value <= 0) {
			toast.add({ type: 'error', title: 'Value must be greater than 0' });
			return;
		}

		// Validate surcharge rate range
		if (
			formData.ruleType === 'surcharge_rate' &&
			(formData.value < 0 || formData.value > 5)
		) {
			toast.add({
				type: 'error',
				title: 'Surcharge rate must be between 0 and 5 (0% to 500%)',
			});
			return;
		}

		try {
			setIsSubmitting(true);
			setConflict(null);
			setFieldErrors({});
			await onSave(formData);
			// Success toast and closing are handled by the parent.
		} catch (error) {
			// Keep the dialog open so the admin can fix and retry.
			const { message, conflict, fieldErrors } = readSaveError(error);
			setConflict(conflict);
			setFieldErrors(fieldErrors);
			if (!conflict) {
				toast.add({
					type: 'error',
					title: 'Failed to save pricing rule',
					description: message,
					timeout: 5000,
				});
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-auto">
			<DialogHeader>
				<DialogTitle>
					{rule ? 'Edit Pricing Rule' : 'Create New Pricing Rule'}
				</DialogTitle>
				<DialogDescription>
					Configure dynamic pricing for specific date ranges and conditions.
				</DialogDescription>
			</DialogHeader>

			<form onSubmit={handleSubmit} className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label htmlFor={`${formId}-name`} className="text-sm font-medium">
							Rule Name
						</label>
						<Input
							id={`${formId}-name`}
							value={formData.name}
							onChange={(e) =>
								setFormData((prev) => ({ ...prev, name: e.target.value }))
							}
							placeholder="Summer Premium, Holiday Rate, etc."
							required
						/>
					</div>
					<div>
						<label
							htmlFor={`${formId}-ruleType`}
							className="text-sm font-medium"
						>
							Rule Type
						</label>
						<select
							id={`${formId}-ruleType`}
							className="h-9 w-full rounded-md border border-input bg-background px-3"
							value={formData.ruleType}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									ruleType: e.target.value as
										| 'surcharge_rate'
										| 'fixed_amount'
										| 'absolute_price',
								}))
							}
						>
							<option value="surcharge_rate">Surcharge Rate (%)</option>
							<option value="fixed_amount">Fixed Amount ($)</option>
							<option value="absolute_price">Absolute Price ($)</option>
						</select>
					</div>
				</div>

				<div>
					<label htmlFor={`${formId}-value`} className="text-sm font-medium">
						{formData.ruleType === 'surcharge_rate'
							? 'Rate (0.20 = 20%)'
							: 'Amount ($)'}
					</label>
					<Input
						id={`${formId}-value`}
						type="number"
						step="0.01"
						value={formData.value}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								value: parseFloat(e.target.value) || 0,
							}))
						}
						required
					/>
				</div>

				<div className="grid grid-cols-2 gap-4">
					<div>
						<label
							htmlFor={`${formId}-startDate`}
							className="text-sm font-medium"
						>
							Start Date
						</label>
						<Input
							id={`${formId}-startDate`}
							type="date"
							value={formData.startDate}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									startDate: e.target.value,
								}))
							}
							required
						/>
					</div>
					<div>
						<label
							htmlFor={`${formId}-endDate`}
							className="text-sm font-medium"
						>
							End Date
						</label>
						<Input
							id={`${formId}-endDate`}
							type="date"
							min={today}
							value={formData.endDate}
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									endDate: e.target.value,
								}))
							}
							required
						/>
					</div>
				</div>
				{conflict && (
					<div
						role="alert"
						className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					>
						<span>
							Overlaps with '{conflict.name}' (
							{formatDateRange(conflict.startDate, conflict.endDate)})
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => onShowConflict(conflict.id)}
						>
							Show rule
						</Button>
					</div>
				)}
				{[...(fieldErrors.startDate ?? []), ...(fieldErrors.endDate ?? [])].map(
					(message) => (
						<p key={message} className="text-sm text-destructive">
							{message}
						</p>
					),
				)}

				<div className="flex items-center space-x-2">
					<input
						type="checkbox"
						id={`${formId}-isActive`}
						checked={formData.isActive}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								isActive: e.target.checked,
							}))
						}
						className="h-4 w-4"
					/>
					<label htmlFor={`${formId}-isActive`} className="text-sm font-medium">
						Active
					</label>
				</div>

				<div className="flex justify-end space-x-2 pt-4">
					<Button type="button" variant="outline" onClick={onCancel}>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting
							? rule
								? 'Updating...'
								: 'Creating...'
							: rule
								? 'Update Rule'
								: 'Create Rule'}
					</Button>
				</div>
			</form>
		</DialogContent>
	);
}
