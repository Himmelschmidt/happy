import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { Typography } from '@/constants/Typography';
import { useAllMachines, useSessions, useSetting } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { MultiTextInput, MultiTextInputHandle } from '@/components/MultiTextInput';
import { machineBash } from '@/sync/ops';

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        alignItems: 'center',
    },
    contentWrapper: {
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    pathInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    pathInput: {
        flex: 1,
        backgroundColor: theme.colors.input.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        minHeight: 36,
        position: 'relative',
        borderWidth: 0.5,
        borderColor: theme.colors.divider,
    },
}));

/**
 * Parse `ls -1pa` output into a list of directory names (excluding . and ..)
 */
function parseDirectories(stdout: string): string[] {
    return stdout
        .split('\n')
        .filter(line => line.endsWith('/') && line !== './' && line !== '../')
        .map(line => line.slice(0, -1)); // strip trailing /
}

export default function PathPickerScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const navigation = useNavigation();
    const params = useLocalSearchParams<{ machineId?: string; selectedPath?: string }>();
    const machines = useAllMachines();
    const sessions = useSessions();
    const inputRef = useRef<MultiTextInputHandle>(null);
    const recentMachinePaths = useSetting('recentMachinePaths');

    const [customPath, setCustomPath] = useState(params.selectedPath || '');

    // Directory browser state
    const [browserPath, setBrowserPath] = useState('');
    const [directories, setDirectories] = useState<string[]>([]);
    const [isBrowsing, setIsBrowsing] = useState(false);
    const [browseError, setBrowseError] = useState<string | null>(null);

    // Get the selected machine
    const machine = useMemo(() => {
        return machines.find(m => m.id === params.machineId);
    }, [machines, params.machineId]);

    // Initialize browser path from machine home dir
    useEffect(() => {
        if (machine && !browserPath) {
            setBrowserPath(machine.metadata?.homeDir || '/home');
        }
    }, [machine, browserPath]);

    // Load directories when browserPath changes
    const loadDirectories = useCallback(async (path: string) => {
        if (!params.machineId) return;

        setIsBrowsing(true);
        setBrowseError(null);

        const result = await machineBash(params.machineId, `ls -1pa "${path}"`, '/');
        if (result.success) {
            setDirectories(parseDirectories(result.stdout));
        } else {
            setBrowseError(result.stderr || 'Failed to list directory');
            setDirectories([]);
        }
        setIsBrowsing(false);
    }, [params.machineId]);

    useEffect(() => {
        if (browserPath) {
            loadDirectories(browserPath);
        }
    }, [browserPath, loadDirectories]);

    // Sync customPath to browserPath when user types or selects from recents
    const handleCustomPathChange = useCallback((text: string) => {
        setCustomPath(text);
    }, []);

    const navigateBrowser = useCallback((dirName: string) => {
        const newPath = browserPath.endsWith('/')
            ? `${browserPath}${dirName}`
            : `${browserPath}/${dirName}`;
        setBrowserPath(newPath);
        setCustomPath(newPath);
    }, [browserPath]);

    const browserGoUp = useCallback(() => {
        if (browserPath === '/') return;
        const parentPath = browserPath.replace(/\/[^/]+\/?$/, '') || '/';
        setBrowserPath(parentPath);
        setCustomPath(parentPath);
    }, [browserPath]);

    // Get recent paths for this machine - prioritize from settings, then fall back to sessions
    const recentPaths = useMemo(() => {
        if (!params.machineId) return [];

        const paths: string[] = [];
        const pathSet = new Set<string>();

        // First, add paths from recentMachinePaths (these are the most recent)
        recentMachinePaths.forEach(entry => {
            if (entry.machineId === params.machineId && !pathSet.has(entry.path)) {
                paths.push(entry.path);
                pathSet.add(entry.path);
            }
        });

        // Then add paths from sessions if we need more
        if (sessions) {
            const pathsWithTimestamps: Array<{ path: string; timestamp: number }> = [];

            sessions.forEach(item => {
                if (typeof item === 'string') return; // Skip section headers

                const session = item as any;
                if (session.metadata?.machineId === params.machineId && session.metadata?.path) {
                    const path = session.metadata.path;
                    if (!pathSet.has(path)) {
                        pathSet.add(path);
                        pathsWithTimestamps.push({
                            path,
                            timestamp: session.updatedAt || session.createdAt
                        });
                    }
                }
            });

            // Sort session paths by most recent first and add them
            pathsWithTimestamps
                .sort((a, b) => b.timestamp - a.timestamp)
                .forEach(item => paths.push(item.path));
        }

        return paths;
    }, [sessions, params.machineId, recentMachinePaths]);


    const handleSelectPath = React.useCallback(() => {
        const pathToUse = customPath.trim() || machine?.metadata?.homeDir || '/home';
        // Pass path back via navigation params (main's pattern, received by new/index.tsx)
        const state = navigation.getState();
        const previousRoute = state?.routes?.[state.index - 1];
        if (state && state.index > 0 && previousRoute) {
            navigation.dispatch({
                ...CommonActions.setParams({ path: pathToUse }),
                source: previousRoute.key,
            } as never);
        }
        router.back();
    }, [customPath, router, machine, navigation]);

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: 'Select Path',
                        headerBackTitle: t('common.back'),
                        headerRight: () => (
                            <Pressable
                                onPress={handleSelectPath}
                                disabled={!customPath.trim()}
                                style={({ pressed }) => ({
                                    marginRight: 16,
                                    opacity: pressed ? 0.7 : 1,
                                    padding: 4,
                                })}
                            >
                                <Ionicons
                                    name="checkmark"
                                    size={24}
                                    color={theme.colors.header.tint}
                                />
                            </Pressable>
                        )
                    }}
                />
                <View style={styles.container}>
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>
                            No machine selected
                        </Text>
                    </View>
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: 'Select Path',
                    headerBackTitle: t('common.back'),
                    headerRight: () => (
                        <Pressable
                            onPress={handleSelectPath}
                            disabled={!customPath.trim()}
                            style={({ pressed }) => ({
                                opacity: pressed ? 0.7 : 1,
                                padding: 4,
                            })}
                        >
                            <Ionicons
                                name="checkmark"
                                size={24}
                                color={theme.colors.header.tint}
                            />
                        </Pressable>
                    )
                }}
            />
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollContainer}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.contentWrapper}>
                        <ItemGroup title="Enter Path">
                            <View style={styles.pathInputContainer}>
                                <View style={[styles.pathInput, { paddingVertical: 8 }]}>
                                    <MultiTextInput
                                        ref={inputRef}
                                        value={customPath}
                                        onChangeText={handleCustomPathChange}
                                        placeholder="Enter path (e.g. /home/user/projects)"
                                        maxHeight={76}
                                        paddingTop={8}
                                        paddingBottom={8}
                                    />
                                </View>
                            </View>
                        </ItemGroup>

                        {/* Directory Browser */}
                        <ItemGroup title={`Browse: ${browserPath}`}>
                            {isBrowsing ? (
                                <View style={{ padding: 20, alignItems: 'center' }}>
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                </View>
                            ) : browseError ? (
                                <View style={{ padding: 16 }}>
                                    <Text style={{
                                        fontSize: 14,
                                        color: theme.colors.textSecondary,
                                        textAlign: 'center',
                                        ...Typography.default()
                                    }}>
                                        {browseError}
                                    </Text>
                                </View>
                            ) : (
                                <>
                                    {browserPath !== '/' && (
                                        <Item
                                            title=".."
                                            leftElement={
                                                <Ionicons
                                                    name="folder-outline"
                                                    size={18}
                                                    color={theme.colors.textSecondary}
                                                />
                                            }
                                            onPress={browserGoUp}
                                            showChevron={false}
                                            showDivider={directories.length > 0}
                                        />
                                    )}
                                    {directories.map((dir, index) => {
                                        const fullDirPath = browserPath.endsWith('/')
                                            ? `${browserPath}${dir}`
                                            : `${browserPath}/${dir}`;
                                        const isSelected = customPath.trim() === fullDirPath;

                                        return (
                                            <Item
                                                key={dir}
                                                title={dir}
                                                leftElement={
                                                    <Ionicons
                                                        name="folder-outline"
                                                        size={18}
                                                        color="#007AFF"
                                                    />
                                                }
                                                onPress={() => navigateBrowser(dir)}
                                                showChevron={false}
                                                pressableStyle={isSelected ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
                                                showDivider={index < directories.length - 1}
                                            />
                                        );
                                    })}
                                    {directories.length === 0 && browserPath === '/' ? null : directories.length === 0 && (
                                        <View style={{ padding: 16 }}>
                                            <Text style={{
                                                fontSize: 14,
                                                color: theme.colors.textSecondary,
                                                textAlign: 'center',
                                                ...Typography.default()
                                            }}>
                                                No subdirectories
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </ItemGroup>

                        {recentPaths.length > 0 && (
                            <ItemGroup title="Recent Paths">
                                {recentPaths.map((path, index) => {
                                    const isSelected = customPath.trim() === path;
                                    const isLast = index === recentPaths.length - 1;

                                    return (
                                        <Item
                                            key={path}
                                            title={path}
                                            leftElement={
                                                <Ionicons
                                                    name="folder-outline"
                                                    size={18}
                                                    color={theme.colors.textSecondary}
                                                />
                                            }
                                            onPress={() => {
                                                setCustomPath(path);
                                                setBrowserPath(path);
                                            }}
                                            selected={isSelected}
                                            showChevron={false}
                                            pressableStyle={isSelected ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
                                            showDivider={!isLast}
                                        />
                                    );
                                })}
                            </ItemGroup>
                        )}

                        {recentPaths.length === 0 && (
                            <ItemGroup title="Suggested Paths">
                                {(() => {
                                    const homeDir = machine.metadata?.homeDir || '/home';
                                    const suggestedPaths = [
                                        homeDir,
                                        `${homeDir}/projects`,
                                        `${homeDir}/Documents`,
                                        `${homeDir}/Desktop`
                                    ];
                                    return suggestedPaths.map((path, index) => {
                                        const isSelected = customPath.trim() === path;

                                        return (
                                            <Item
                                                key={path}
                                                title={path}
                                                leftElement={
                                                    <Ionicons
                                                        name="folder-outline"
                                                        size={18}
                                                        color={theme.colors.textSecondary}
                                                    />
                                                }
                                                onPress={() => {
                                                    setCustomPath(path);
                                                    setBrowserPath(path);
                                                }}
                                                selected={isSelected}
                                                showChevron={false}
                                                pressableStyle={isSelected ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
                                                showDivider={index < 3}
                                            />
                                        );
                                    });
                                })()}
                            </ItemGroup>
                        )}
                    </View>
                </ScrollView>
            </View>
        </>
    );
}
