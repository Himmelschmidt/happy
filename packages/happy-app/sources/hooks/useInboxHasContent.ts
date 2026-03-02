import { useUpdates } from './useUpdates';
import { useChangelog } from './useChangelog';
import { useNotifications } from '@/firebase/notifications';

/** Hook to check if inbox has content to show (unread notifications, updates, changelog). */
export function useInboxHasContent(): boolean {
    const { updateAvailable } = useUpdates();
    const changelog = useChangelog();
    const { unreadCount } = useNotifications();

    return updateAvailable || unreadCount > 0 || (changelog.hasUnread === true);
}
