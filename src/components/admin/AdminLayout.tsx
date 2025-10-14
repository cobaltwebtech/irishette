import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AppSidebar } from '@/components/admin/app-sidebar';
import { Separator } from '@/components/ui/separator';
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from '@/components/ui/sidebar';
import { useSession } from '@/lib/auth-client';

interface AdminLayoutProps {
	children: React.ReactNode;
	title?: string;
}

export function AdminLayout({ children, title }: AdminLayoutProps) {
	const { data: session, isPending } = useSession();
	const navigate = useNavigate();
	const [defaultOpen, setDefaultOpen] = useState<boolean | undefined>(
		undefined,
	);

	// Load sidebar state from localStorage
	useEffect(() => {
		const savedState = localStorage.getItem('sidebar:state');
		if (savedState) {
			setDefaultOpen(savedState === 'true');
		} else {
			setDefaultOpen(true); // Default to open
		}
	}, []);

	// Client-side auth check
	useEffect(() => {
		if (!isPending && (!session?.user || session.user.role !== 'admin')) {
			navigate({ to: '/' });
		}
	}, [session, isPending, navigate]);

	// Show loading or redirect if not authenticated
	if (isPending || !session?.user || session.user.role !== 'admin') {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	// Wait for state to be loaded from localStorage
	if (defaultOpen === undefined) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<SidebarProvider
			defaultOpen={defaultOpen}
			onOpenChange={(open) => {
				localStorage.setItem('sidebar:state', String(open));
			}}
		>
			<AppSidebar
				user={{
					name: session.user.name || null,
					email: session.user.email,
				}}
			/>
			<SidebarInset className="min-w-0">
				<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
					<div className="flex items-center gap-2 px-4">
						<SidebarTrigger className="-ml-1" />
						<Separator orientation="vertical" className="mr-2 h-4" />
						{title && <h1 className="text-3xl font-bold">{title}</h1>}
					</div>
				</header>
				<div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-w-0">
					{children}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
