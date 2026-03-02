import * as React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useNotifications, markNotificationRead, type Notification } from '@/firebase/notifications';
import { t } from '@/text';
import { UpdateBanner } from './UpdateBanner';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import { useIsTablet } from '@/utils/responsive';
import { Header } from './navigation/Header';
import { Image } from 'expo-image';
import { VoiceAssistantStatusBar } from './VoiceAssistantStatusBar';
import { useRealtimeStatus } from '@/sync/storage';

const BODY_PREVIEW_LENGTH = 120;

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyDescription: {
        fontSize: 16,
        ...Typography.default(),
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    card: {
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 12,
        padding: 14,
        shadowColor: theme.colors.shadow.color,
        shadowOffset: { width: 0, height: 0.33 },
        shadowOpacity: theme.colors.shadow.opacity,
        shadowRadius: 0,
        elevation: 1,
    },
    cardUnread: {
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.button.primary.background,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    cardTitle: {
        fontSize: 16,
        ...Typography.default('semiBold'),
        color: theme.colors.text,
        flex: 1,
    },
    cardTime: {
        fontSize: 12,
        ...Typography.default(),
        color: theme.colors.textSecondary,
        marginLeft: 8,
    },
    cardBody: {
        fontSize: 14,
        ...Typography.default(),
        color: theme.colors.text,
        lineHeight: 20,
    },
    expandHint: {
        fontSize: 13,
        ...Typography.default(),
        color: theme.colors.textSecondary,
        marginTop: 4,
    },
}));

interface InboxViewProps {
}

/** Tablet-mode header title */
function HeaderTitleTablet() {
    const { theme } = useUnistyles();
    return (
        <Text style={{
            fontSize: 17,
            color: theme.colors.header.tint,
            fontWeight: '600',
            ...Typography.default('semiBold'),
        }}>
            {t('tabs.inbox')}
        </Text>
    );
}

/** Format a timestamp as a short relative string ("2m", "3h", "Jan 5") */
function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const date = new Date(ts);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Single notification card */
const NotificationCard = React.memo(({ notification }: { notification: Notification }) => {
    const [expanded, setExpanded] = React.useState(false);

    const isLong = notification.body.length > BODY_PREVIEW_LENGTH;
    const displayBody = expanded || !isLong
        ? notification.body
        : notification.body.slice(0, BODY_PREVIEW_LENGTH) + '…';

    const handlePress = React.useCallback(() => {
        if (!notification.read) {
            markNotificationRead(notification.id);
        }
        if (isLong) {
            setExpanded((prev) => !prev);
        }
    }, [notification.id, notification.read, isLong]);

    return (
        <Pressable onPress={handlePress}>
            <View style={[styles.card, !notification.read && styles.cardUnread]}>
                <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{notification.title}</Text>
                    <Text style={styles.cardTime}>{formatRelativeTime(notification.timestamp)}</Text>
                </View>
                <Text style={styles.cardBody}>{displayBody}</Text>
                {isLong && !expanded && (
                    <Text style={styles.expandHint}>Tap to expand</Text>
                )}
            </View>
        </Pressable>
    );
});

export const InboxView = React.memo(({}: InboxViewProps) => {
    const { notifications, loading, unreadCount } = useNotifications();
    const { theme } = useUnistyles();
    const isTablet = useIsTablet();
    const realtimeStatus = useRealtimeStatus();

    const tabletHeader = isTablet ? (
        <View style={{ backgroundColor: theme.colors.groupped.background }}>
            <Header
                title={<HeaderTitleTablet />}
                headerRight={() => null}
                headerLeft={() => null}
                headerShadowVisible={false}
                headerTransparent={true}
            />
            {realtimeStatus !== 'disconnected' && (
                <VoiceAssistantStatusBar variant="full" />
            )}
        </View>
    ) : null;

    if (loading) {
        return (
            <View style={styles.container}>
                {tabletHeader}
                <UpdateBanner />
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color={theme.colors.textSecondary} />
                </View>
            </View>
        );
    }

    if (notifications.length === 0) {
        return (
            <View style={styles.container}>
                {tabletHeader}
                <UpdateBanner />
                <View style={styles.emptyContainer}>
                    <Image
                        source={require('@/assets/images/brutalist/Brutalism 10.png')}
                        contentFit="contain"
                        style={[{ width: 64, height: 64 }, styles.emptyIcon]}
                        tintColor={theme.colors.textSecondary}
                    />
                    <Text style={styles.emptyTitle}>{t('inbox.emptyTitle')}</Text>
                    <Text style={styles.emptyDescription}>{t('inbox.emptyDescription')}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {tabletHeader}
            <ScrollView contentContainerStyle={{
                maxWidth: layout.maxWidth,
                alignSelf: 'center',
                width: '100%',
                paddingBottom: 24,
            }}>
                <UpdateBanner />
                {notifications.map((n) => (
                    <NotificationCard key={n.id} notification={n} />
                ))}
            </ScrollView>
        </View>
    );
});
