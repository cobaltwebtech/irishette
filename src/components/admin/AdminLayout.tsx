import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
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

	// Load sidebar state from localStorage with lazy initialization
	// Check for SSR - localStorage is only available in the browser
	const [sidebarOpen, setSidebarOpen] = useState(() => {
		if (typeof window === 'undefined') return true;
		const savedState = localStorage.getItem('sidebar:state');
		return savedState ? savedState === 'true' : true;
	});

	// Client-side auth check
	useEffect(() => {
		if (!isPending && (!session?.user || session.user.role !== 'admin')) {
			navigate({ to: '/' });
		}
	}, [session, isPending, navigate]);

	// Show loading while checking auth
	if (isPending) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4"></div>
					<p className="text-muted-foreground">Loading...</p>
				</div>
			</div>
		);
	}

	// At this point, session is guaranteed to exist due to the useEffect redirect
	if (!session?.user) {
		return null;
	}

	return (
		<SidebarProvider
			open={sidebarOpen}
			onOpenChange={(open) => {
				setSidebarOpen(open);
				localStorage.setItem('sidebar:state', String(open));
			}}
		>
			<AdminSidebar
				user={{
					name: session.user.name || null,
					email: session.user.email,
				}}
			/>
			<SidebarInset className="min-w-0">
				<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
