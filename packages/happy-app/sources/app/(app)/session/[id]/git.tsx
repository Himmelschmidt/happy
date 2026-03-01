import * as React from 'react';
import { View, ActivityIndicator, ScrollView, Platform, Pressable } from 'react-native';
import { Text } from '@/components/StyledText';
import { useRoute } from '@react-navigation/native';
import { Octicons, Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { ItemList } from '@/components/ItemList';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { DiffView } from '@/components/diff/DiffView';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { storage } from '@/sync/storage';
import { getGitStatusFiles, GitFileStatus, GitStatusFiles } from '@/sync/gitStatusFiles';
import { sessionBash, sessionReadFile } from '@/sync/ops';


/** Detect language from file extension for syntax highlighting */
function getFileLanguage(path: string): string | null {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        // Web
        case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
        case 'ts': case 'tsx': case 'mts': case 'cts': return 'typescript';
        case 'html': case 'htm': case 'svelte': case 'vue': return 'html';
        case 'css': case 'scss': case 'sass': case 'less': return 'css';
        case 'json': case 'jsonc': case 'json5': return 'json';
        // Scripting
        case 'py': case 'pyw': case 'pyi': return 'python';
        case 'rb': case 'erb': case 'rake': case 'gemspec': return 'ruby';
        case 'php': case 'phtml': return 'php';
        case 'pl': case 'pm': return 'perl';
        case 'lua': return 'lua';
        case 'r': case 'R': return 'r';
        // Shell
        case 'sh': case 'bash': case 'zsh': case 'fish': return 'bash';
        case 'ps1': case 'psm1': return 'powershell';
        // Systems
        case 'c': case 'h': return 'c';
        case 'cpp': case 'cc': case 'cxx': case 'hpp': case 'hxx': case 'hh': return 'cpp';
        case 'rs': return 'rust';
        case 'go': return 'go';
        case 'zig': return 'zig';
        // JVM
        case 'java': return 'java';
        case 'kt': case 'kts': return 'kotlin';
        case 'scala': case 'sc': return 'scala';
        case 'groovy': case 'gradle': return 'groovy';
        // .NET
        case 'cs': return 'csharp';
        case 'fs': case 'fsx': return 'fsharp';
        // Mobile
        case 'swift': return 'swift';
        case 'dart': return 'dart';
        // Functional
        case 'hs': case 'lhs': return 'haskell';
        case 'ex': case 'exs': return 'elixir';
        case 'erl': case 'hrl': return 'erlang';
        case 'clj': case 'cljs': case 'cljc': return 'clojure';
        case 'ml': case 'mli': return 'ocaml';
        // Data / Config
        case 'sql': return 'sql';
        case 'xml': case 'xsl': case 'xslt': case 'plist': return 'xml';
        case 'yaml': case 'yml': return 'yaml';
        case 'toml': return 'toml';
        case 'ini': case 'cfg': case 'conf': return 'ini';
        case 'env': return 'bash';
        // Docs
        case 'md': case 'mdx': return 'markdown';
        case 'tex': case 'latex': return 'latex';
        case 'rst': return 'rst';
        // Infra / DevOps
        case 'tf': case 'tfvars': return 'hcl';
        case 'Dockerfile': return 'dockerfile';
        case 'proto': return 'protobuf';
        case 'graphql': case 'gql': return 'graphql';
        default: return null;
    }
}

interface DiffContent {
    oldText: string;
    newText: string;
    isLoading: boolean;
    error?: string;
}

/**
 * Decode file content from sessionReadFile which may be utf8 or base64.
 */
function decodeFileContent(response: { success: boolean; content?: string; encoding?: string }): string | null {
    if (!response.success || !response.content) return null;
    if ((response as any).encoding === 'utf8') return response.content;
    try {
        const decoded = atob(response.content);
        // Binary check: look for null bytes in first 8KB
        const sampleLen = Math.min(decoded.length, 8192);
        for (let i = 0; i < sampleLen; i++) {
            if (decoded.charCodeAt(i) === 0) return null; // binary
        }
        return decoded;
    } catch {
        return response.content;
    }
}

/**
 * Shell-escape a file path for use in git commands.
 */
function shellEscape(path: string): string {
    return path.replace(/'/g, "'\\''");
}

export default function GitScreen() {
    const route = useRoute();
    const sessionId = (route.params! as any).id as string;
    const { theme } = useUnistyles();

    const session = storage.getState().sessions[sessionId];
    const cwd = session?.metadata?.path || '/';

    const [gitStatus, setGitStatus] = React.useState<GitStatusFiles | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState(false);
    const [expandedFiles, setExpandedFiles] = React.useState<Set<string>>(new Set());
    const [diffContents, setDiffContents] = React.useState<Record<string, DiffContent>>({});

    // Load git status on mount
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setIsLoading(true);
                setError(false);
                const status = await getGitStatusFiles(sessionId);
                if (!cancelled) {
                    setGitStatus(status);
                    if (!status) setError(true);
                }
            } catch {
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [sessionId]);

    // Load diff content for a specific file
    const loadDiffContent = React.useCallback(async (file: GitFileStatus, key: string) => {
        setDiffContents(prev => ({ ...prev, [key]: { oldText: '', newText: '', isLoading: true } }));

        try {
            let oldText = '';
            let newText = '';
            const escaped = shellEscape(file.fullPath);

            if (file.status === 'untracked') {
                const result = await sessionReadFile(sessionId, `${cwd}/${file.fullPath}`);
                const decoded = decodeFileContent(result);
                newText = decoded ?? '';
                if (decoded === null) {
                    setDiffContents(prev => ({
                        ...prev,
                        [key]: { oldText: '', newText: '', isLoading: false, error: 'Binary file' }
                    }));
                    return;
                }
            } else if (file.status === 'deleted') {
                const result = await sessionBash(sessionId, {
                    command: `git show HEAD:'${escaped}'`,
                    cwd, timeout: 10000
                });
                oldText = result.success ? result.stdout : '';
            } else if (file.isStaged) {
                const [oldResult, newResult] = await Promise.all([
                    sessionBash(sessionId, { command: `git show HEAD:'${escaped}'`, cwd, timeout: 10000 }),
                    sessionBash(sessionId, { command: `git show :'${escaped}'`, cwd, timeout: 10000 }),
                ]);
                oldText = oldResult.success ? oldResult.stdout : '';
                newText = newResult.success ? newResult.stdout : '';
            } else {
                // Unstaged: index vs working tree
                const [oldResult, newResult] = await Promise.all([
                    sessionBash(sessionId, { command: `git show :'${escaped}'`, cwd, timeout: 10000 }),
                    sessionReadFile(sessionId, `${cwd}/${file.fullPath}`),
                ]);
                oldText = oldResult.success ? oldResult.stdout : '';
                const decoded = decodeFileContent(newResult);
                if (decoded === null) {
                    setDiffContents(prev => ({
                        ...prev,
                        [key]: { oldText: '', newText: '', isLoading: false, error: 'Binary file' }
                    }));
                    return;
                }
                newText = decoded;
            }

            // Guard against extremely large files (>1MB)
            if (oldText.length > 1_000_000 || newText.length > 1_000_000) {
                setDiffContents(prev => ({
                    ...prev,
                    [key]: { oldText: '', newText: '', isLoading: false, error: 'File too large to diff' }
                }));
                return;
            }

            setDiffContents(prev => ({ ...prev, [key]: { oldText, newText, isLoading: false } }));
        } catch {
            setDiffContents(prev => ({
                ...prev,
                [key]: { oldText: '', newText: '', isLoading: false, error: 'Failed to load diff' }
            }));
        }
    }, [sessionId, cwd]);

    // Toggle file expansion and lazy-load diff
    const toggleFile = React.useCallback((file: GitFileStatus) => {
        const key = `${file.isStaged ? 'staged' : 'unstaged'}:${file.fullPath}`;
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
                if (!diffContents[key]) {
                    loadDiffContent(file, key);
                }
            }
            return next;
        });
    }, [diffContents, loadDiffContent]);

    // Loading state
    if (isLoading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface }}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
        );
    }

    // Error / not a git repo
    if (error || !gitStatus) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: theme.colors.surface }}>
                <Octicons name="alert" size={48} color={theme.colors.textSecondary} />
                <Text style={{
                    fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 16,
                    ...Typography.default()
                }}>
                    {t('files.notRepo')}
                </Text>
            </View>
        );
    }

    const hasChanges = gitStatus.totalStaged > 0 || gitStatus.totalUnstaged > 0;

    // No changes
    if (!hasChanges) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: theme.colors.surface }}>
                <Octicons name="check-circle" size={48} color={theme.colors.gitAddedText} />
                <Text style={{
                    fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginTop: 16,
                    ...Typography.default()
                }}>
                    {t('files.noChanges')}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <ItemList style={{ flex: 1 }}>
                {/* Branch / Summary */}
                <ItemGroup>
                    <Item
                        title={gitStatus.branch || t('files.detachedHead')}
                        subtitle={t('files.summary', { staged: gitStatus.totalStaged, unstaged: gitStatus.totalUnstaged })}
                        icon={<Octicons name="git-branch" size={24} color={theme.colors.button.secondary.tint} />}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Staged Changes */}
                {gitStatus.totalStaged > 0 && (
                    <ItemGroup title={t('files.stagedChanges', { count: gitStatus.totalStaged })}>
                        {gitStatus.stagedFiles.map((file, index) => {
                            const key = `staged:${file.fullPath}`;
                            return (
                                <GitFileItem
                                    key={key}
                                    file={file}
                                    isExpanded={expandedFiles.has(key)}
                                    diffContent={diffContents[key]}
                                    onToggle={() => toggleFile(file)}
                                    isLast={index === gitStatus.stagedFiles.length - 1}
                                />
                            );
                        })}
                    </ItemGroup>
                )}

                {/* Unstaged Changes */}
                {gitStatus.totalUnstaged > 0 && (
                    <ItemGroup title={t('files.unstagedChanges', { count: gitStatus.totalUnstaged })}>
                        {gitStatus.unstagedFiles.map((file, index) => {
                            const key = `unstaged:${file.fullPath}`;
                            return (
                                <GitFileItem
                                    key={key}
                                    file={file}
                                    isExpanded={expandedFiles.has(key)}
                                    diffContent={diffContents[key]}
                                    onToggle={() => toggleFile(file)}
                                    isLast={index === gitStatus.unstagedFiles.length - 1}
                                />
                            );
                        })}
                    </ItemGroup>
                )}
            </ItemList>
        </View>
    );
}

// --- File item with expandable diff ---

const STATUS_CHARS: Record<GitFileStatus['status'], string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: '?',
};

function GitFileItem({ file, isExpanded, diffContent, onToggle, isLast }: {
    file: GitFileStatus;
    isExpanded: boolean;
    diffContent?: DiffContent;
    onToggle: () => void;
    isLast: boolean;
}) {
    const { theme } = useUnistyles();

    const statusColor = (file.status === 'added' || file.status === 'untracked')
        ? theme.colors.gitAddedText
        : file.status === 'deleted'
            ? theme.colors.gitRemovedText
            : theme.colors.textSecondary;

    return (
        <View>
            <Item
                title={file.fileName}
                subtitle={file.filePath || undefined}
                icon={
                    <View style={{ width: 29, height: 29, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{
                            fontSize: 14, fontWeight: '700', color: statusColor,
                            ...Typography.mono()
                        }}>
                            {STATUS_CHARS[file.status] || '?'}
                        </Text>
                    </View>
                }
                rightElement={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {file.linesAdded > 0 && (
                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.gitAddedText, ...Typography.mono() }}>
                                +{file.linesAdded}
                            </Text>
                        )}
                        {file.linesRemoved > 0 && (
                            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.gitRemovedText, ...Typography.mono() }}>
                                -{file.linesRemoved}
                            </Text>
                        )}
                        <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={theme.colors.textSecondary}
                        />
                    </View>
                }
                onPress={onToggle}
                showChevron={false}
                showDivider={!isExpanded && !isLast}
            />
            {isExpanded && (
                <View style={{
                    marginHorizontal: 12,
                    marginBottom: 12,
                    borderRadius: 8,
                    overflow: 'hidden',
                    borderWidth: Platform.select({ ios: 0.33, default: 1 }),
                    borderColor: theme.colors.divider,
                }}>
                    {diffContent?.isLoading ? (
                        <View style={{ padding: 24, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                        </View>
                    ) : diffContent?.error ? (
                        <View style={{ padding: 16, alignItems: 'center' }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, ...Typography.default() }}>
                                {diffContent.error}
                            </Text>
                        </View>
                    ) : diffContent ? (
                        diffContent.oldText === diffContent.newText ? (
                            <View style={{ padding: 16, alignItems: 'center' }}>
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 13, ...Typography.default() }}>
                                    {t('files.noChanges')}
                                </Text>
                            </View>
                        ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                <DiffView
                                    oldText={diffContent.oldText}
                                    newText={diffContent.newText}
                                    contextLines={3}
                                    language={getFileLanguage(file.fullPath)}
                                />
                            </ScrollView>
                        )
                    ) : null}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        maxWidth: layout.maxWidth,
        alignSelf: 'center' as const,
        width: '100%',
    }
}));
