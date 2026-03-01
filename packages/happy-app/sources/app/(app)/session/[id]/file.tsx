import * as React from 'react';
import { View, ScrollView, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Text } from '@/components/StyledText';
import { SimpleSyntaxHighlighter } from '@/components/SimpleSyntaxHighlighter';
import { Typography } from '@/constants/Typography';
import { sessionReadFile } from '@/sync/ops';
import { Modal } from '@/modal';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { FileIcon } from '@/components/FileIcon';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

interface FileContent {
    content: string;
    encoding: 'utf8' | 'base64';
    isBinary: boolean;
    isImage?: boolean;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'tif'] as const;

function isImageFile(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ext ? (IMAGE_EXTENSIONS as readonly string[]).includes(ext) : false;
}

function getImageMimeType(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'png': return 'image/png';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'gif': return 'image/gif';
        case 'bmp': return 'image/bmp';
        case 'webp': return 'image/webp';
        case 'svg': return 'image/svg+xml';
        case 'ico': return 'image/x-icon';
        case 'tiff':
        case 'tif': return 'image/tiff';
        default: return 'application/octet-stream';
    }
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 3;

function ZoomableImage({ uri, width }: { uri: string; width: number }) {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    const pinch = Gesture.Pinch()
        .onUpdate((e) => {
            const newScale = savedScale.value * e.scale;
            scale.value = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            if (scale.value <= MIN_SCALE) {
                scale.value = withTiming(MIN_SCALE);
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedScale.value = MIN_SCALE;
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            }
        });

    const pan = Gesture.Pan()
        .onUpdate((e) => {
            if (scale.value > MIN_SCALE) {
                translateX.value = savedTranslateX.value + e.translationX;
                translateY.value = savedTranslateY.value + e.translationY;
            }
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
            if (scale.value > MIN_SCALE) {
                scale.value = withTiming(MIN_SCALE);
                translateX.value = withTiming(0);
                translateY.value = withTiming(0);
                savedScale.value = MIN_SCALE;
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                scale.value = withTiming(DOUBLE_TAP_SCALE);
                savedScale.value = DOUBLE_TAP_SCALE;
            }
        });

    const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    return (
        <GestureDetector gesture={composed}>
            <Animated.View style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}>
                <Animated.View style={animatedStyle}>
                    <Image
                        source={{ uri }}
                        style={{
                            width,
                            height: width,
                        }}
                        contentFit="contain"
                    />
                </Animated.View>
            </Animated.View>
        </GestureDetector>
    );
}

export default function FileScreen() {
    const route = useRoute();
    const { theme } = useUnistyles();
    const { id: sessionId } = useLocalSearchParams<{ id: string }>();
    const searchParams = useLocalSearchParams();
    const encodedPath = searchParams.path as string;
    let filePath = '';

    // Decode URI-encoded path with error handling
    try {
        filePath = encodedPath ? decodeURIComponent(encodedPath) : '';
    } catch (error) {
        console.error('Failed to decode file path:', error);
        filePath = encodedPath || '';
    }

    const { width: windowWidth } = useWindowDimensions();
    const [fileContent, setFileContent] = React.useState<FileContent | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Determine file language from extension
    const getFileLanguage = React.useCallback((path: string): string | null => {
        const ext = path.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'js':
            case 'jsx':
                return 'javascript';
            case 'ts':
            case 'tsx':
                return 'typescript';
            case 'py':
                return 'python';
            case 'html':
            case 'htm':
                return 'html';
            case 'css':
                return 'css';
            case 'json':
                return 'json';
            case 'md':
                return 'markdown';
            case 'xml':
                return 'xml';
            case 'yaml':
            case 'yml':
                return 'yaml';
            case 'sh':
            case 'bash':
                return 'bash';
            case 'sql':
                return 'sql';
            case 'go':
                return 'go';
            case 'rust':
            case 'rs':
                return 'rust';
            case 'java':
                return 'java';
            case 'c':
                return 'c';
            case 'cpp':
            case 'cc':
            case 'cxx':
                return 'cpp';
            case 'php':
                return 'php';
            case 'rb':
                return 'ruby';
            case 'swift':
                return 'swift';
            case 'kt':
                return 'kotlin';
            default:
                return null;
        }
    }, []);

    // Check if file is likely binary based on extension
    const isBinaryFile = React.useCallback((path: string): boolean => {
        const ext = path.split('.').pop()?.toLowerCase();
        const binaryExtensions = [
            'png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'ico',
            'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm',
            'mp3', 'wav', 'flac', 'aac', 'ogg',
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'zip', 'tar', 'gz', 'rar', '7z',
            'exe', 'dmg', 'deb', 'rpm',
            'woff', 'woff2', 'ttf', 'otf',
            'db', 'sqlite', 'sqlite3'
        ];
        return ext ? binaryExtensions.includes(ext) : false;
    }, []);

    // Load file content
    React.useEffect(() => {
        let isCancelled = false;

        const loadFile = async () => {
            try {
                setIsLoading(true);
                setError(null);

                console.error(`[file.tsx] loadFile: path=${filePath}, isBinary=${isBinaryFile(filePath)}, isImage=${isImageFile(filePath)}`);

                // Binary files: show image or "binary file" message
                if (isBinaryFile(filePath)) {
                    if (isImageFile(filePath)) {
                        try {
                            console.error(`[file.tsx] Requesting image readFile...`);
                            const response = await sessionReadFile(sessionId, filePath);
                            console.error(`[file.tsx] Image readFile response: success=${response.success}, contentLen=${response.content?.length ?? 0}, encoding=${(response as any).encoding}, error=${response.error}`);
                            if (!isCancelled && response.success && response.content) {
                                setFileContent({
                                    content: response.content,
                                    encoding: 'base64',
                                    isBinary: true,
                                    isImage: true,
                                });
                            } else if (!isCancelled) {
                                console.error(`[file.tsx] Image readFile failed or empty`);
                                setFileContent({ content: '', encoding: 'base64', isBinary: true, isImage: true });
                            }
                        } catch (imgError) {
                            console.error(`[file.tsx] Image readFile exception:`, imgError);
                            if (!isCancelled) {
                                setFileContent({ content: '', encoding: 'base64', isBinary: true, isImage: true });
                            }
                        }
                    } else if (!isCancelled) {
                        setFileContent({ content: '', encoding: 'base64', isBinary: true });
                    }
                    if (!isCancelled) setIsLoading(false);
                    return;
                }

                // Text files: read content directly
                const response = await sessionReadFile(sessionId, filePath);

                if (isCancelled) return;

                if (response.success && response.content) {
                    // CLI sends encoding: 'utf8' for text files (no base64 overhead)
                    const serverEncoding = (response as any).encoding as string | undefined;

                    let decodedContent: string;
                    if (serverEncoding === 'utf8') {
                        // Already plain text — no decoding needed
                        decodedContent = response.content;
                    } else {
                        // Legacy base64 path
                        try {
                            decodedContent = atob(response.content);
                        } catch (decodeError) {
                            setFileContent({ content: '', encoding: 'base64', isBinary: true });
                            return;
                        }

                        // Quick binary check: look for null bytes in the first 8KB
                        const sampleLength = Math.min(decodedContent.length, 8192);
                        let isBinary = false;
                        for (let i = 0; i < sampleLength; i++) {
                            if (decodedContent.charCodeAt(i) === 0) { isBinary = true; break; }
                        }
                        if (isBinary) {
                            setFileContent({ content: '', encoding: 'base64', isBinary: true });
                            return;
                        }
                    }

                    setFileContent({
                        content: decodedContent,
                        encoding: 'utf8',
                        isBinary: false,
                    });
                } else {
                    setError(response.error || 'Failed to read file');
                }
            } catch (error) {
                console.error('Failed to load file:', error);
                if (!isCancelled) {
                    setError('Failed to load file');
                }
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        };

        loadFile();

        return () => {
            isCancelled = true;
        };
    }, [sessionId, filePath, isBinaryFile]);

    // Show error modal if there's an error
    React.useEffect(() => {
        if (error) {
            Modal.alert(t('common.error'), error);
        }
    }, [error]);

    const fileName = filePath.split('/').pop() || filePath;
    // Skip syntax highlighting for large files — tokenizing 10K+ chars creates thousands of
    // Text components which freezes the UI
    const MAX_HIGHLIGHT_SIZE = 10_000;
    const contentLength = fileContent?.content?.length ?? 0;
    const language = contentLength <= MAX_HIGHLIGHT_SIZE ? getFileLanguage(filePath) : null;

    if (isLoading) {
        return (
            <View style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                <Text style={{
                    marginTop: 16,
                    fontSize: 16,
                    color: theme.colors.textSecondary,
                    ...Typography.default()
                }}>
                    {t('files.loadingFile', { fileName })}
                </Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                justifyContent: 'center',
                alignItems: 'center',
                padding: 20
            }}>
                <Text style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: theme.colors.textDestructive,
                    marginBottom: 8,
                    ...Typography.default('semiBold')
                }}>
                    {t('common.error')}
                </Text>
                <Text style={{
                    fontSize: 16,
                    color: theme.colors.textSecondary,
                    textAlign: 'center',
                    ...Typography.default()
                }}>
                    {error}
                </Text>
            </View>
        );
    }

    if (fileContent?.isBinary) {
        // Image viewing with pinch-to-zoom, pan, and double-tap
        if (fileContent.isImage && fileContent.content) {
            const mime = getImageMimeType(filePath);
            return (
                <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
                    {/* File path header */}
                    <View style={{
                        padding: 16,
                        borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                        borderBottomColor: theme.colors.divider,
                        backgroundColor: theme.colors.surfaceHigh,
                        flexDirection: 'row',
                        alignItems: 'center'
                    }}>
                        <FileIcon fileName={fileName} size={20} />
                        <Text style={{
                            fontSize: 14,
                            color: theme.colors.textSecondary,
                            marginLeft: 8,
                            flex: 1,
                            ...Typography.mono()
                        }}>
                            {filePath}
                        </Text>
                    </View>
                    <ZoomableImage
                        uri={`data:${mime};base64,${fileContent.content}`}
                        width={windowWidth - 32}
                    />
                </View>
            );
        }

        // Non-image binary file
        return (
            <View style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                justifyContent: 'center',
                alignItems: 'center',
                padding: 20
            }}>
                <Text style={{
                    fontSize: 18,
                    fontWeight: 'bold',
                    color: theme.colors.textSecondary,
                    marginBottom: 8,
                    ...Typography.default('semiBold')
                }}>
                    {t('files.binaryFile')}
                </Text>
                <Text style={{
                    fontSize: 16,
                    color: theme.colors.textSecondary,
                    textAlign: 'center',
                    ...Typography.default()
                }}>
                    {t('files.cannotDisplayBinary')}
                </Text>
                <Text style={{
                    fontSize: 14,
                    color: '#999',
                    textAlign: 'center',
                    marginTop: 8,
                    ...Typography.default()
                }}>
                    {fileName}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>

            {/* File path header */}
            <View style={{
                padding: 16,
                borderBottomWidth: Platform.select({ ios: 0.33, default: 1 }),
                borderBottomColor: theme.colors.divider,
                backgroundColor: theme.colors.surfaceHigh,
                flexDirection: 'row',
                alignItems: 'center'
            }}>
                <FileIcon fileName={fileName} size={20} />
                <Text style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    marginLeft: 8,
                    flex: 1,
                    ...Typography.mono()
                }}>
                    {filePath}
                </Text>
            </View>

            {/* Content display */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16 }}
                showsVerticalScrollIndicator={true}
            >
                {fileContent?.content ? (
                    <SimpleSyntaxHighlighter
                        code={fileContent.content}
                        language={language}
                        selectable={true}
                    />
                ) : (
                    <Text style={{
                        fontSize: 16,
                        color: theme.colors.textSecondary,
                        fontStyle: 'italic',
                        ...Typography.default()
                    }}>
                        {t('files.fileEmpty')}
                    </Text>
                )}
            </ScrollView>
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
