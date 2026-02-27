import * as React from 'react';
import { View, ActivityIndicator, Platform } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Octicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Item } from '@/components/Item';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { sessionListDirectory, DirectoryEntry } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { FileIcon } from '@/components/FileIcon';
import { t } from '@/text';

function formatFileSize(bytes?: number): string {
    if (bytes == null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default React.memo(function BrowseScreen() {
    const route = useRoute();
    const router = useRouter();
    const sessionId = (route.params! as any).id as string;
    const { theme } = useUnistyles();

    const session = storage.getState().sessions[sessionId];
    const rootPath = session?.metadata?.path || '/';

    const [currentPath, setCurrentPath] = React.useState(rootPath);
    const [entries, setEntries] = React.useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const loadDirectory = React.useCallback(async (path: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await sessionListDirectory(sessionId, path);
            if (response.success && response.entries) {
                // Sort: directories first, then files, alphabetically
                const sorted = [...response.entries].sort((a, b) => {
                    if (a.type === 'directory' && b.type !== 'directory') return -1;
                    if (a.type !== 'directory' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                });
                setEntries(sorted);
            } else {
                setError(response.error || t('browse.failedToLoadDirectory'));
                setEntries([]);
            }
        } catch {
            setError(t('browse.failedToLoadDirectory'));
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    React.useEffect(() => {
        loadDirectory(currentPath);
    }, [currentPath, loadDirectory]);

    const handleEntryPress = React.useCallback((entry: DirectoryEntry) => {
        const fullPath = currentPath.endsWith('/')
            ? `${currentPath}${entry.name}`
            : `${currentPath}/${entry.name}`;

        if (entry.type === 'directory') {
            setCurrentPath(fullPath);
        } else {
            const encodedPath = btoa(fullPath);
            router.push(`/session/${sessionId}/file?path=${encodedPath}`);
        }
    }, [currentPath, sessionId, router]);

    const handleGoUp = React.useCallback(() => {
        const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
        setCurrentPath(parentPath);
    }, [currentPath]);

    const canGoUp = currentPath !== rootPath && currentPath !== '/';

    const renderEntryIcon = (entry: DirectoryEntry) => {
        if (entry.type === 'directory') {
            return <Octicons name="file-directory" size={29} color="#007AFF" />;
        }
        return <FileIcon fileName={entry.name} size={29} />;
    };

    const renderEntrySubtitle = (entry: DirectoryEntry) => {
        if (entry.type === 'directory') return t('browse.directory');
        return formatFileSize(entry.size);
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            {/* Breadcrumb header */}
            <View style={{
                padding: 16,
                borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                borderBottomColor: theme.colors.divider,
                backgroundColor: theme.colors.surfaceHigh,
            }}>
                <Text style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    ...Typography.mono()
                }} numberOfLines={2}>
                    {currentPath}
                </Text>
            </View>

            <ItemList style={{ flex: 1 }}>
                {isLoading ? (
                    <View style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingTop: 40
                    }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : error ? (
                    <View style={{
                        flex: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingTop: 40,
                        paddingHorizontal: 20
                    }}>
                        <Octicons name="alert" size={48} color={theme.colors.textDestructive} />
                        <Text style={{
                            fontSize: 16,
                            color: theme.colors.textSecondary,
                            textAlign: 'center',
                            marginTop: 16,
                            ...Typography.default()
                        }}>
                            {error}
                        </Text>
                    </View>
                ) : (
                    <>
                        {canGoUp && (
                            <Item
                                title=".."
                                subtitle={t('browse.parentDirectory')}
                                icon={<Octicons name="arrow-up" size={29} color={theme.colors.textSecondary} />}
                                onPress={handleGoUp}
                                showDivider={entries.length > 0}
                            />
                        )}
                        {entries.length === 0 && !canGoUp ? (
                            <View style={{
                                flex: 1,
                                justifyContent: 'center',
                                alignItems: 'center',
                                paddingTop: 40,
                                paddingHorizontal: 20
                            }}>
                                <Octicons name="file-directory" size={48} color={theme.colors.textSecondary} />
                                <Text style={{
                                    fontSize: 16,
                                    color: theme.colors.textSecondary,
                                    textAlign: 'center',
                                    marginTop: 16,
                                    ...Typography.default()
                                }}>
                                    {t('browse.emptyDirectory')}
                                </Text>
                            </View>
                        ) : (
                            entries.map((entry, index) => (
                                <Item
                                    key={entry.name}
                                    title={entry.name}
                                    subtitle={renderEntrySubtitle(entry)}
                                    icon={renderEntryIcon(entry)}
                                    onPress={() => handleEntryPress(entry)}
                                    showChevron={entry.type === 'directory'}
                                    showDivider={index < entries.length - 1}
                                />
                            ))
                        )}
                    </>
                )}
            </ItemList>
        </View>
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    }
}));
