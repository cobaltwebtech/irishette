import {
	hashKey,
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';

import { toast } from '@/components/ui/toast';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/integrations/trpc/types';
import type { InboxStatus } from '@/lib/inbox';

// Data hooks of the admin notification pages. Status is shared by all admins.

type ListData = RouterOutputs['inbox']['adminList'];
type LinkedList = RouterOutputs['inbox']['adminListForBooking'];
type ItemData = RouterOutputs['inbox']['adminGet'];

/** How often the sidebar badge refreshes (also on window focus). */
const UNREAD_REFETCH_MS = 5 * 60 * 1000;

/** Unread count for the sidebar badge, cached and polled every 5 minutes. */
export function useUnreadCount() {
	const trpc = useTRPC();
	const { data } = useQuery(
		trpc.inbox.adminUnreadCount.queryOptions(undefined, {
			refetchInterval: UNREAD_REFETCH_MS,
			refetchOnWindowFocus: true,
			staleTime: 60 * 1000,
		}),
	);
	return data?.unread ?? 0;
}

/**
 * Marks items new / read / archived / unarchived. Updates the cached rows,
 * the open item and the unread badge at once (optimistic), rolls back on an
 * error, then refetches every inbox query so the server's values win.
 */
export function useSetInboxStatus() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	return useMutation(
		trpc.inbox.adminSetStatus.mutationOptions({
			onMutate: async ({ publicIds, status }) => {
				await queryClient.cancelQueries(trpc.inbox.pathFilter());
				const snapshot = queryClient.getQueriesData(trpc.inbox.pathFilter());
				const next: InboxStatus = status === 'unarchived' ? 'read' : status;
				const ids = new Set(publicIds);
				const before = new Map<string, InboxStatus>();
				const apply = <T extends { publicId: string; status: InboxStatus }>(
					item: T,
				): T => {
					if (!ids.has(item.publicId)) return item;
					before.set(item.publicId, item.status);
					return { ...item, status: next };
				};

				queryClient.setQueriesData<ListData>(
					trpc.inbox.adminList.pathFilter(),
					(data) => data && { ...data, items: data.items.map(apply) },
				);
				for (const filter of [
					trpc.inbox.adminListForBooking.pathFilter(),
					trpc.inbox.adminListForUser.pathFilter(),
				]) {
					queryClient.setQueriesData<LinkedList>(filter, (data) =>
						data?.map(apply),
					);
				}
				queryClient.setQueriesData<ItemData>(
					trpc.inbox.adminGet.pathFilter(),
					(data) => data && apply(data),
				);

				let delta = 0;
				for (const previous of before.values()) {
					if (previous === 'new' && next !== 'new') delta--;
					if (previous !== 'new' && next === 'new') delta++;
				}
				queryClient.setQueryData(
					trpc.inbox.adminUnreadCount.queryKey(),
					(data) => data && { unread: Math.max(0, data.unread + delta) },
				);
				return { snapshot };
			},
			onError: (_error, _variables, context) => {
				restore(queryClient, context?.snapshot);
				toast.add({
					type: 'error',
					title: 'Could not update the notifications. Please try again.',
				});
			},
			onSettled: () => queryClient.invalidateQueries(trpc.inbox.pathFilter()),
		}),
	);
}

function restore(
	queryClient: ReturnType<typeof useQueryClient>,
	snapshot: Array<[QueryKey, unknown]> | undefined,
) {
	for (const [key, data] of snapshot ?? []) queryClient.setQueryData(key, data);
}

/**
 * Deletes items for good, then refetches every inbox query except the
 * deleted items themselves (a page showing one would hit NOT_FOUND before it
 * navigates away). Cached copies nobody shows are dropped; a detail page
 * drops its own with `forgetItem` after leaving.
 */
export function useDeleteInboxItems() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	return useMutation(
		trpc.inbox.adminDelete.mutationOptions({
			onSuccess: ({ deleted }) => {
				toast.add({
					type: 'success',
					title:
						deleted === 1
							? 'Notification deleted'
							: `${deleted} notifications deleted`,
				});
			},
			onError: () => {
				toast.add({
					type: 'error',
					title: 'Could not delete. Please try again.',
				});
			},
			onSettled: async (_data, _error, { publicIds }) => {
				const keys = publicIds.map((publicId) =>
					trpc.inbox.adminGet.queryKey({ publicId }),
				);
				const deleted = new Set(keys.map((key) => hashKey(key)));
				await queryClient.invalidateQueries({
					...trpc.inbox.pathFilter(),
					predicate: (query) => !deleted.has(query.queryHash),
				});
				for (const queryKey of keys) {
					const query = queryClient
						.getQueryCache()
						.find({ queryKey, exact: true });
					if (query && query.getObserversCount() === 0) {
						queryClient.removeQueries({ queryKey, exact: true });
					}
				}
			},
		}),
	);
}

/** Drops a deleted item's cached copy (call after navigating away). */
export function useForgetInboxItem() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	return (publicId: string) =>
		queryClient.removeQueries({
			queryKey: trpc.inbox.adminGet.queryKey({ publicId }),
			exact: true,
		});
}
