import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import { Icon } from '@iconify/react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/twMerge';

/**
 * Global toast manager. `toast.add({ type, title, description })` from
 * anywhere; `type` is 'success' | 'error' | 'info' | 'warning' | 'loading'.
 */
const toast = ToastPrimitive.createToastManager();

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
	return <ToastPrimitive.Provider {...props} />;
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props) {
	return <ToastPrimitive.Portal data-slot="toast-portal" {...props} />;
}

// Placement matches the previous sonner toaster: above dialogs (z-100),
// bottom-right, 24px offset,
// 356px wide; full width with a 16px offset on small screens.
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
	return (
		<ToastPrimitive.Viewport
			data-slot="toast-viewport"
			className={cn(
				'pointer-events-none fixed inset-x-4 bottom-4 z-100 w-auto outline-none sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[356px]',
				className,
			)}
			{...props}
		/>
	);
}

function Toast({ className, ...props }: ToastPrimitive.Root.Props) {
	return (
		<ToastPrimitive.Root
			data-slot="toast"
			className={cn(
				'group/toast pointer-events-auto absolute right-0 bottom-0 z-[calc(1000-var(--toast-index))] w-full origin-bottom rounded-[8px] border border-popover-foreground bg-secondary text-[13px] text-popover-foreground shadow-[0_4px_12px_rgba(0,0,0,0.1)] will-change-transform outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'[--gap:0.875rem] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] [--peek:0.875rem] [--scale:calc(max(0,1-(var(--toast-index)*0.05)))] [--shrink:calc(1-var(--scale))]',
				'h-(--height) [transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] [transition:transform_400ms_ease,opacity_400ms,height_150ms]',
				"after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
				'data-expanded:h-(--toast-height) data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]',
				'data-limited:opacity-0 data-starting-style:[transform:translateY(100%)] data-starting-style:opacity-0',
				'[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(100%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:opacity-0',
				'data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
				'data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
				'data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]',
				'data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]',
				className,
			)}
			{...props}
		/>
	);
}

function ToastContent({ className, ...props }: ToastPrimitive.Content.Props) {
	return (
		<ToastPrimitive.Content
			data-slot="toast-content"
			className={cn(
				'flex h-full items-center gap-1.5 overflow-hidden p-4 transition-opacity duration-250 data-behind:opacity-0 data-expanded:opacity-100',
				className,
			)}
			{...props}
		/>
	);
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
	return (
		<ToastPrimitive.Title
			data-slot="toast-title"
			className={cn('leading-normal font-medium', className)}
			{...props}
		/>
	);
}

function ToastDescription({
	className,
	...props
}: ToastPrimitive.Description.Props) {
	return (
		<ToastPrimitive.Description
			data-slot="toast-description"
			className={cn('leading-[1.4] font-normal text-[#3f3f3f]', className)}
			{...props}
		/>
	);
}

function ToastAction({
	className,
	render = <Button variant="outline" size="sm" />,
	...props
}: ToastPrimitive.Action.Props) {
	return (
		<ToastPrimitive.Action
			data-slot="toast-action"
			render={render}
			className={cn('shrink-0', className)}
			{...props}
		/>
	);
}

function ToastClose({
	className,
	children,
	...props
}: ToastPrimitive.Close.Props) {
	return (
		<ToastPrimitive.Close
			data-slot="toast-close"
			aria-label="Close toast"
			className={cn(
				'relative shrink-0 rounded-xs opacity-70 transition-opacity hover:opacity-100',
				className,
			)}
			{...props}
		>
			{children ?? <Icon icon="tabler:x" className="size-4" aria-hidden />}
		</ToastPrimitive.Close>
	);
}

// The icons the sonner toaster used.
const TOAST_ICONS: Record<string, React.ReactNode> = {
	success: (
		<Icon icon="tabler:circle-check-filled" className="size-6 text-primary" />
	),
	error: (
		<Icon icon="tabler:circle-x-filled" className="size-6 text-destructive" />
	),
	loading: <Icon icon="tabler:loader-2" className="size-6 animate-spin" />,
	warning: (
		<Icon icon="tabler:alert-triangle-filled" className="size-6 text-accent" />
	),
	info: (
		<Icon
			icon="tabler:alert-circle-filled"
			className="size-6 text-secondary-foreground"
		/>
	),
};

function ToastIcon({ type }: { type: string | undefined }) {
	const icon = type ? TOAST_ICONS[type] : undefined;
	if (!icon) return null;
	return (
		<span
			data-slot="toast-icon"
			aria-hidden
			className="relative mr-1 -ml-[3px] flex size-4 shrink-0 items-center justify-start *:shrink-0"
		>
			{icon}
		</span>
	);
}

function ToastList() {
	const { toasts } = ToastPrimitive.useToastManager();

	return toasts.map((toastItem) => (
		<Toast key={toastItem.id} toast={toastItem}>
			<ToastContent>
				<ToastIcon type={toastItem.type} />
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<ToastTitle />
					<ToastDescription />
				</div>
				<ToastAction />
			</ToastContent>
		</Toast>
	));
}

/** Mount once (in `__root.tsx`). Toasts last 4s, at most 3 are shown. */
function Toaster({
	children,
	toastManager = toast,
	timeout = 4000,
	limit = 3,
	...props
}: ToastPrimitive.Provider.Props) {
	return (
		<ToastProvider
			toastManager={toastManager}
			timeout={timeout}
			limit={limit}
			{...props}
		>
			{children}
			<ToastPortal>
				<ToastViewport>
					<ToastList />
				</ToastViewport>
			</ToastPortal>
		</ToastProvider>
	);
}

export {
	Toaster,
	Toast,
	ToastAction,
	ToastClose,
	ToastContent,
	ToastDescription,
	ToastPortal,
	ToastProvider,
	ToastTitle,
	ToastViewport,
	toast,
};
