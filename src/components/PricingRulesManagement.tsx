import { Calendar, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
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
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import type {
	CreatePricingRule,
	RoomPricingRule,
	UpdatePricingRule,
} from '@/lib/room-validation';

// Helper function to parse validation errors into human-readable messages
function parseValidationErrors(errorMessage: string): string {
	try {
		const errors = JSON.parse(errorMessage);
		if (Array.isArray(errors)) {
			const fieldErrors = errors.map(
				(error: { code: string; path?: string[]; message?: string }) => {
					const field = error.path ? error.path[0] : 'unknown field';
					const friendlyField = field.replace(/([A-Z])/g, ' $1').toLowerCase();

					switch (error.code) {
						case 'invalid_type':
							return `${friendlyField} is required`;
						case 'invalid_value':
							return `${friendlyField} has an invalid value`;
						case 'too_small':
							return `${friendlyField} is too small`;
						case 'too_big':
							return `${friendlyField} is too large`;
						default:
							return error.message || `${friendlyField} is invalid`;
					}
				},
			);

			return (
				fieldErrors.slice(0, 3).join(', ') +
				(fieldErrors.length > 3 ? ', and more...' : '')
			);
		}
	} catch {
		// If parsing fails, return a generic message
	}

	// Fallback for non-JSON errors or parsing failures
	if (errorMessage.includes('overlaps with existing rule')) {
		return errorMessage; // Keep overlap messages as they are already user-friendly
	}

	if (errorMessage.includes('roomId') && errorMessage.includes('undefined')) {
		return 'There was a problem with the room data. Please refresh the page and try again.';
	}

	return 'Please check your input and try again';
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

	const calculateEffectivePrice = (rule: RoomPricingRule) => {
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

	const formatDaysOfWeek = (daysOfWeek: string | undefined) => {
		if (!daysOfWeek) return 'All days';
		try {
			const days = JSON.parse(daysOfWeek) as string[];
			return days
				.map((day) => day.charAt(0).toUpperCase() + day.slice(1))
				.join(', ');
		} catch {
			return 'All days';
		}
	};

	// Filter pricing rules to show only current and future rules
	const filteredRules = pricingRules.filter((rule) => {
		const endDate = new Date(`${rule.endDate}T00:00:00`);
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day
		return endDate >= today;
	});

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<Calendar className="h-5 w-5" />
							Pricing Rules - {roomName}
						</CardTitle>
						<CardDescription>
							Base price: ${basePrice.toFixed(2)}/night. Manage dynamic pricing
							rules for different seasons, events, and conditions. Only current
							and future rules are displayed.
						</CardDescription>
					</div>
					<Button
						onClick={() => setIsCreating(true)}
						size="sm"
						className="flex items-center gap-2"
					>
						<Plus className="h-4 w-4" />
						Add Rule
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{pricingRules.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
						<p className="text-lg font-medium">No pricing rules configured</p>
						<p className="text-sm">
							Add your first pricing rule to enable dynamic pricing for this
							room.
						</p>
					</div>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Rule Name</TableHead>
								<TableHead>Type</TableHead>
								<TableHead>Value</TableHead>
								<TableHead>Effective Price</TableHead>
								<TableHead>Date Range</TableHead>
								<TableHead>Days</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-[50px]"></TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredRules
								.sort(
									(a, b) =>
										new Date(`${a.startDate}T00:00:00`).getTime() -
										new Date(`${b.startDate}T00:00:00`).getTime(),
								)
								.map((rule) => (
									<TableRow key={rule.id}>
										<TableCell className="font-medium">{rule.name}</TableCell>
										<TableCell>
											<Badge variant={getRuleBadgeVariant(rule.ruleType)}>
												{getRuleTypeLabel(rule.ruleType)}
											</Badge>
										</TableCell>
										<TableCell className="font-mono">
											{formatRuleValue(rule)}
										</TableCell>
										<TableCell className="font-semibold">
											${calculateEffectivePrice(rule).toFixed(2)}
										</TableCell>
										<TableCell className="text-sm">
											{formatDateRange(rule.startDate, rule.endDate)}
										</TableCell>
										<TableCell className="text-sm">
											{formatDaysOfWeek(rule.daysOfWeek)}
										</TableCell>
										<TableCell>
											<Badge variant={rule.isActive ? 'default' : 'secondary'}>
												{rule.isActive ? 'Active' : 'Inactive'}
											</Badge>
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" className="h-8 w-8 p-0">
														<span className="sr-only">Open menu</span>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuLabel>Actions</DropdownMenuLabel>
													<DropdownMenuItem
														onClick={() => setEditingRule(rule)}
													>
														<Pencil className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => setDeletingRule(rule)}
														className="text-destructive"
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))}
						</TableBody>
					</Table>
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
							onSave={async (rule) => {
								if (editingRule?.id) {
									await onUpdateRule({ ...rule, id: editingRule.id });
									toast.success('Pricing rule updated successfully');
									setEditingRule(null);
								} else {
									await onCreateRule(rule);
									toast.success('Pricing rule created successfully');
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
									<Trash2 className="h-5 w-5 text-destructive" />
									Delete Pricing Rule
								</DialogTitle>
								<DialogDescription className="text-left">
									Are you sure you want to delete the pricing rule{' '}
									<strong>"{deletingRule.name}"</strong>?
									<br />
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
												toast.success('Pricing rule deleted successfully');
												setDeletingRule(null);
											} catch (error) {
												console.error('Failed to delete pricing rule:', error);
												toast.error('Failed to delete pricing rule');
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
}

function PricingRuleForm({
	roomId,
	rule,
	onSave,
	onCancel,
}: PricingRuleFormProps) {
	const formId = useId();
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Get today's date in YYYY-MM-DD format for input min attribute
	const today = new Date().toISOString().split('T')[0];

	const [formData, setFormData] = useState<CreatePricingRule>({
		roomId,
		name: rule?.name || '',
		ruleType: rule?.ruleType || 'surcharge_rate',
		value: rule?.value || 0,
		startDate: rule?.startDate || '',
		endDate: rule?.endDate || '',
		isActive: rule?.isActive ?? true,
		daysOfWeek: rule?.daysOfWeek || undefined,
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Basic validation
		if (!formData.name.trim()) {
			toast.error('Rule name is required');
			return;
		}

		if (!formData.startDate || !formData.endDate) {
			toast.error('Start and end dates are required');
			return;
		}

		if (
			new Date(`${formData.startDate}T00:00:00`) >=
			new Date(`${formData.endDate}T00:00:00`)
		) {
			toast.error('End date must be after start date');
			return;
		}

		// Prevent creating rules with past dates
		const today = new Date();
		today.setHours(0, 0, 0, 0); // Reset time to start of day
		const startDate = new Date(`${formData.startDate}T00:00:00`);
		const endDate = new Date(`${formData.endDate}T00:00:00`);

		if (startDate < today) {
			toast.error('Start date cannot be in the past');
			return;
		}

		if (endDate < today) {
			toast.error('End date cannot be in the past');
			return;
		}

		if (formData.value <= 0) {
			toast.error('Value must be greater than 0');
			return;
		}

		// Validate surcharge rate range
		if (
			formData.ruleType === 'surcharge_rate' &&
			(formData.value < 0 || formData.value > 5)
		) {
			toast.error('Surcharge rate must be between 0 and 5 (0% to 500%)');
			return;
		}

		try {
			setIsSubmitting(true);
			await onSave(formData);

			// If we get here, the operation was successful
			// The success toast and modal closing is handled by the parent component
		} catch (error) {
			// Handle specific error types
			if (error instanceof Error) {
				if (error.message.includes('overlaps with existing rule')) {
					toast.error('Date Overlap Detected', {
						description: error.message,
						duration: 6000,
					});
				} else if (error.message.includes('not found')) {
					toast.error('Rule not found', {
						description:
							'The pricing rule may have been deleted by another user.',
						duration: 5000,
					});
				} else {
					// Parse validation errors or use the error message
					const friendlyMessage = parseValidationErrors(error.message);
					toast.error('Failed to save pricing rule', {
						description: friendlyMessage,
						duration: 5000,
					});
				}
			} else {
				toast.error('Failed to save pricing rule', {
					description: 'An unexpected error occurred. Please try again.',
					duration: 5000,
				});
			}
			// Don't close the modal on error - let user fix and retry
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-auto">
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
							className="w-full h-9 px-3 border border-input bg-background rounded-md"
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
							min={today}
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
