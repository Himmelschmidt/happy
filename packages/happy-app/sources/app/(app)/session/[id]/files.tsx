import * as React from 'react';
import { View, ActivityIndicator, Platform, TextInput, ScrollView, Pressable, BackHandler } from 'react-native';
import { t } from '@/text';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Octicons } from '@expo/vector-icons';
import { Text } from '@/components/StyledText';
import { Item } from '@/components/Item';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { searchFiles, FileItem } from '@/sync/suggestionFile';
import { sessionListDirectory, DirectoryEntry } from '@/sync/ops';
import { storage } from '@/sync/storage';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { FileIcon } from '@/components/FileIcon';

/**
 * Format a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FilesScreen() {
    const route = useRoute();
    const router = useRouter();
    const navigation = useNavigation();
    const sessionId = (route.params! as any).id as string;

    // Get session root path from metadata
    const session = storage.getState().sessions[sessionId];
    const sessionRootPath = session?.metadata?.path || '/';

    const [currentPath, setCurrentPath] = React.useState(sessionRootPath);
    const [directoryEntries, setDirectoryEntries] = React.useState<DirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [directoryError, setDirectoryError] = React.useState<string | null>(null);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [searchResults, setSearchResults] = React.useState<FileItem[]>([]);
    const [isSearching, setIsSearching] = React.useState(false);
    const { theme } = useUnistyles();

    // Load directory contents
    const loadDirectory = React.useCallback(async (path: string) => {
        try {
            setIsLoading(true);
            setDirectoryError(null);
            const response = await sessionListDirectory(sessionId, path);
            if (response.success && response.entries) {
                // Sort: directories first, then files, alphabetically within each group
                const sorted = [...response.entries].sort((a, b) => {
                    if (a.type === 'directory' && b.type !== 'directory') return -1;
                    if (a.type !== 'directory' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                });
                setDirectoryEntries(sorted);
            } else {
                setDirectoryError(response.error || t('files.directoryError'));
                setDirectoryEntries([]);
            }
        } catch (error) {
            setDirectoryError(t('files.directoryError'));
            setDirectoryEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [sessionId]);

    // Use a ref so useFocusEffect always reads the latest path without re-firing on changes
    const currentPathRef = React.useRef(currentPath);
    currentPathRef.current = currentPath;

    // Reload on screen focus (returning from file viewer, etc.)
    useFocusEffect(
        React.useCallback(() => {
            loadDirectory(currentPathRef.current);
        }, [loadDirectory])
    );

    // Reload directory when path changes (navigating into subdirectories)
    const isFirstMount = React.useRef(true);
    React.useEffect(() => {
        if (isFirstMount.current) {
            isFirstMount.current = false;
            return; // Skip first mount — useFocusEffect handles it
        }
        loadDirectory(currentPath);
    }, [currentPath, loadDirectory]);

    // Handle search
    React.useEffect(() => {
        if (!searchQuery) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        const loadFiles = async () => {
            try {
                setIsSearching(true);
                const results = await searchFiles(sessionId, searchQuery, { limit: 100 });
                setSearchResults(results);
            } catch (error) {
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        loadFiles();
    }, [searchQuery, sessionId]);

    // Navigation handlers
    const navigateToDirectory = React.useCallback((path: string) => {
        setSearchQuery('');
        setCurrentPath(path);
    }, []);

    const handleEntryPress = React.useCallback((entry: DirectoryEntry) => {
        const fullPath = currentPath.endsWith('/')
            ? `${currentPath}${entry.name}`
            : `${currentPath}/${entry.name}`;

        if (entry.type === 'directory') {
            navigateToDirectory(fullPath);
        } else {
            const encodedPath = encodeURIComponent(fullPath);
            router.push(`/session/${sessionId}/file?path=${encodedPath}`);
        }
    }, [currentPath, navigateToDirectory, router, sessionId]);

    const handleFilePress = React.useCallback((file: FileItem) => {
        if (file.fileType === 'folder') {
            navigateToDirectory(file.fullPath);
            return;
        }
        const encodedPath = encodeURIComponent(file.fullPath);
        router.push(`/session/${sessionId}/file?path=${encodedPath}`);
    }, [navigateToDirectory, router, sessionId]);

    const isAtFilesystemRoot = currentPath === '/';

    const goUp = React.useCallback(() => {
        if (isAtFilesystemRoot) return;
        const parentPath = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
        navigateToDirectory(parentPath);
    }, [currentPath, isAtFilesystemRoot, navigateToDirectory]);

    // Intercept hardware/gesture back button to navigate up directories
    // Must use useFocusEffect so the handler is only active when this screen is focused,
    // otherwise it intercepts back gestures meant for screens on top (e.g. file.tsx)
    useFocusEffect(
        React.useCallback(() => {
            if (isAtFilesystemRoot) return;

            const handler = BackHandler.addEventListener('hardwareBackPress', () => {
                goUp();
                return true;
            });
            return () => handler.remove();
        }, [isAtFilesystemRoot, goUp])
    );

    // Override header back button to navigate up directories (always visible unless at /)
    React.useEffect(() => {
        if (isAtFilesystemRoot) {
            navigation.setOptions({ headerLeft: undefined });
        } else {
            navigation.setOptions({
                headerLeft: () => (
                    <Pressable onPress={goUp} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                        <Octicons name="chevron-left" size={24} color={theme.colors.text} />
                    </Pressable>
                ),
            });
        }
    }, [isAtFilesystemRoot, navigation, goUp, theme]);

    // Build breadcrumb segments from the full absolute path
    const breadcrumbs = React.useMemo(() => {
        const segments = currentPath.split('/').filter(Boolean);
        const crumbs = [{ label: '/', path: '/' }];
        let accumulated = '';
        for (const segment of segments) {
            accumulated = `${accumulated}/${segment}`;
            crumbs.push({ label: segment, path: accumulated });
        }
        return crumbs;
    }, [currentPath]);

    const renderSearchIcon = (file: FileItem) => {
        if (file.fileType === 'folder') {
            return <Octicons name="file-directory" size={29} color="#007AFF" />;
        }
        return <FileIcon fileName={file.fileName} size={29} />;
    };

    // Determine if we're in search mode
    const isSearchMode = searchQuery.length > 0;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>

            {/* Search Input */}
            <View style={{
                padding: 16,
                borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                borderBottomColor: theme.colors.divider
            }}>
                <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.input.background,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 8
                }}>
                    <Octicons name="search" size={16} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={t('files.searchPlaceholder')}
                        style={{
                            flex: 1,
                            fontSize: 16,
                            ...Typography.default()
                        }}
                        placeholderTextColor={theme.colors.input.placeholder}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            </View>

            {/* Breadcrumb Navigation (hidden during search) */}
            {!isSearchMode && (
                <View style={{
                    borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                    borderBottomColor: theme.colors.divider,
                }}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            alignItems: 'center',
                        }}
                    >
                        {breadcrumbs.map((crumb, index) => (
                            <React.Fragment key={crumb.path}>
                                {index > 0 && (
                                    <Octicons
                                        name="chevron-right"
                                        size={12}
                                        color={theme.colors.textSecondary}
                                        style={{ marginHorizontal: 6 }}
                                    />
                                )}
                                <Pressable
                                    onPress={() => {
                                        if (index < breadcrumbs.length - 1) {
                                            navigateToDirectory(crumb.path);
                                        }
                                    }}
                                    disabled={index === breadcrumbs.length - 1}
                                >
                                    <Text style={{
                                        fontSize: 14,
                                        color: index === breadcrumbs.length - 1
                                            ? theme.colors.text
                                            : theme.colors.textLink,
                                        fontWeight: index === breadcrumbs.length - 1 ? '600' : '400',
                                        ...Typography.default(),
                                    }}>
                                        {crumb.label}
                                    </Text>
                                </Pressable>
                            </React.Fragment>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Content */}
            <ItemList style={{ flex: 1 }}>
                {isSearchMode ? (
                    // Search mode
                    isSearching ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
                            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            <Text style={{
                                fontSize: 16,
                                color: theme.colors.textSecondary,
                                textAlign: 'center',
                                marginTop: 16,
                                ...Typography.default()
                            }}>
                                {t('files.searching')}
                            </Text>
                        </View>
                    ) : searchResults.length === 0 ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
                            <Octicons name="search" size={48} color={theme.colors.textSecondary} />
                            <Text style={{
                                fontSize: 16,
                                color: theme.colors.textSecondary,
                                textAlign: 'center',
                                marginTop: 16,
                                ...Typography.default()
                            }}>
                                {t('files.noFilesFound')}
                            </Text>
                            <Text style={{
                                fontSize: 14,
                                color: theme.colors.textSecondary,
                                textAlign: 'center',
                                marginTop: 8,
                                ...Typography.default()
                            }}>
                                {t('files.tryDifferentTerm')}
                            </Text>
                        </View>
                    ) : (
                        <>
                            <View style={{
                                backgroundColor: theme.colors.surfaceHigh,
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                                borderBottomColor: theme.colors.divider
                            }}>
                                <Text style={{
                                    fontSize: 14,
                                    fontWeight: '600',
                                    color: theme.colors.textLink,
                                    ...Typography.default()
                                }}>
                                    {t('files.searchResults', { count: searchResults.length })}
                                </Text>
                            </View>
                            {searchResults.map((file, index) => (
                                <Item
                                    key={`file-${file.fullPath}-${index}`}
                                    title={file.fileName}
                                    subtitle={file.filePath || t('files.projectRoot')}
                                    icon={renderSearchIcon(file)}
                                    onPress={() => handleFilePress(file)}
                                    showDivider={index < searchResults.length - 1}
                                />
                            ))}
                        </>
                    )
                ) : isLoading ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : directoryError ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
                        <Octicons name="alert" size={48} color={theme.colors.textSecondary} />
                        <Text style={{
                            fontSize: 16,
                            color: theme.colors.textSecondary,
                            textAlign: 'center',
                            marginTop: 16,
                            ...Typography.default()
                        }}>
                            {directoryError}
                        </Text>
                    </View>
                ) : directoryEntries.length === 0 ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
                        <Octicons name="file-directory" size={48} color={theme.colors.textSecondary} />
                        <Text style={{
                            fontSize: 16,
                            color: theme.colors.textSecondary,
                            textAlign: 'center',
                            marginTop: 16,
                            ...Typography.default()
                        }}>
                            {t('files.emptyDirectory')}
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* Parent directory row */}
                        {!isAtFilesystemRoot && (
                            <Item
                                title=".."
                                subtitle={t('files.parentDirectory')}
                                icon={<Octicons name="file-directory" size={29} color={theme.colors.textSecondary} />}
                                onPress={goUp}
                                showDivider={directoryEntries.length > 0}
                            />
                        )}

                        {/* Directory entries */}
                        {directoryEntries.map((entry, index) => {
                            const fullPath = currentPath.endsWith('/')
                                ? `${currentPath}${entry.name}`
                                : `${currentPath}/${entry.name}`;

                            const isDirectory = entry.type === 'directory';
                            const subtitle = isDirectory
                                ? undefined
                                : (entry.size != null ? formatFileSize(entry.size) : undefined);

                            return (
                                <Item
                                    key={`entry-${entry.name}-${index}`}
                                    title={entry.name}
                                    subtitle={subtitle}
                                    icon={isDirectory
                                        ? <Octicons name="file-directory" size={29} color="#007AFF" />
                                        : <FileIcon fileName={entry.name} size={29} />
                                    }
                                    onPress={() => handleEntryPress(entry)}
                                    showDivider={index < directoryEntries.length - 1}
                                />
                            );
                        })}
                    </>
                )}
            </ItemList>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
        width: '100%',
    }
}));
