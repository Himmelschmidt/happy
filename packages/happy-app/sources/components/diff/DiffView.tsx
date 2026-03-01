import React, { useMemo } from 'react';
import { View, Text, ViewStyle } from 'react-native';
import { calculateUnifiedDiff, DiffToken } from '@/components/diff/calculateDiff';
import { tokenizeCode, getColors as getSyntaxColors } from '@/components/SimpleSyntaxHighlighter';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';


interface DiffViewProps {
    oldText: string;
    newText: string;
    contextLines?: number;
    showLineNumbers?: boolean;
    showPlusMinusSymbols?: boolean;
    showDiffStats?: boolean;
    oldTitle?: string;
    newTitle?: string;
    style?: ViewStyle;
    maxHeight?: number;
    wrapLines?: boolean;
    fontScaleX?: number;
    language?: string | null;
}

/** Map syntax token type to a theme color */
function getSyntaxTokenColor(type: string, nestLevel: number | undefined, syntaxColors: ReturnType<typeof getSyntaxColors>): string {
    switch (type) {
        case 'keyword': return syntaxColors.keyword;
        case 'controlFlow': return syntaxColors.controlFlow;
        case 'type': return syntaxColors.type;
        case 'modifier': return syntaxColors.modifier;
        case 'string': return syntaxColors.string;
        case 'number': return syntaxColors.number;
        case 'boolean': return syntaxColors.boolean;
        case 'regex': return syntaxColors.regex;
        case 'function': return syntaxColors.function;
        case 'method': return syntaxColors.method;
        case 'property': return syntaxColors.property;
        case 'comment': return syntaxColors.comment;
        case 'docstring': return syntaxColors.docstring;
        case 'operator': return syntaxColors.operator;
        case 'assignment': return syntaxColors.assignment;
        case 'comparison': return syntaxColors.comparison;
        case 'logical': return syntaxColors.logical;
        case 'decorator': return syntaxColors.decorator;
        case 'import': return syntaxColors.import;
        case 'variable': return syntaxColors.variable;
        case 'parameter': return syntaxColors.parameter;
        case 'punctuation': return syntaxColors.punctuation;
        case 'bracket':
            switch ((nestLevel || 1) % 5) {
                case 1: return syntaxColors.bracket1;
                case 2: return syntaxColors.bracket2;
                case 3: return syntaxColors.bracket3;
                case 4: return syntaxColors.bracket4;
                case 0: return syntaxColors.bracket5;
                default: return syntaxColors.bracket1;
            }
        default: return syntaxColors.default;
    }
}

export const DiffView: React.FC<DiffViewProps> = ({
    oldText,
    newText,
    contextLines = 3,
    showLineNumbers = true,
    showPlusMinusSymbols = true,
    wrapLines = false,
    style,
    fontScaleX = 1,
    language,
}) => {
    // Always use light theme colors
    const { theme } = useUnistyles();
    const colors = theme.colors.diff;
    const syntaxColors = useMemo(() => language ? getSyntaxColors(theme) : null, [language, theme]);

    // Calculate diff with inline highlighting
    const { hunks } = useMemo(() => {
        return calculateUnifiedDiff(oldText, newText, contextLines);
    }, [oldText, newText, contextLines]);

    // Styles
    const containerStyle: ViewStyle = {
        backgroundColor: theme.colors.surface,
        borderWidth: 0,
        flex: 1,
        ...style,
    };


    // Helper function to format line content
    const formatLineContent = (content: string) => {
        // Just trim trailing spaces, we'll handle leading spaces in rendering
        return content.trimEnd();
    };

    // Render line content with syntax highlighting (no inline diff tokens)
    const renderSyntaxLineContent = (content: string) => {
        const formatted = formatLineContent(content);
        if (!syntaxColors || !language) return <Text>{formatted}</Text>;

        const tokens = tokenizeCode(formatted, language);
        let processedLeading = false;

        return tokens.map((token, idx) => {
            // Handle leading spaces as dots
            if (!processedLeading && token.text && token.type === 'default') {
                const leadingMatch = token.text.match(/^( +)/);
                if (leadingMatch) {
                    processedLeading = true;
                    const dots = '\u00b7'.repeat(leadingMatch[0].length);
                    const rest = token.text.slice(leadingMatch[0].length);
                    return (
                        <Text key={idx}>
                            <Text style={{ color: colors.leadingSpaceDot }}>{dots}</Text>
                            {rest ? <Text style={{ color: getSyntaxTokenColor(token.type, token.nestLevel, syntaxColors) }}>{rest}</Text> : null}
                        </Text>
                    );
                }
                processedLeading = true;
            }
            if (!processedLeading) {
                processedLeading = true;
            }

            return (
                <Text key={idx} style={{ color: getSyntaxTokenColor(token.type, token.nestLevel, syntaxColors) }}>
                    {token.text}
                </Text>
            );
        });
    };

    // Helper function to render line content with styled leading space dots and inline highlighting
    const renderLineContent = (content: string, baseColor: string, tokens?: DiffToken[]) => {
        const formatted = formatLineContent(content);

        if (tokens && tokens.length > 0) {
            // Render with inline highlighting
            let processedLeadingSpaces = false;

            return tokens.map((token, idx) => {
                // Process leading spaces in the first token only
                if (!processedLeadingSpaces && token.value) {
                    const leadingMatch = token.value.match(/^( +)/);
                    if (leadingMatch) {
                        processedLeadingSpaces = true;
                        const leadingDots = '\u00b7'.repeat(leadingMatch[0].length);
                        const restOfToken = token.value.slice(leadingMatch[0].length);

                        if (token.added || token.removed) {
                            return (
                                <Text key={idx}>
                                    <Text style={{ color: colors.leadingSpaceDot }}>{leadingDots}</Text>
                                    <Text style={{
                                        backgroundColor: token.added ? colors.inlineAddedBg : colors.inlineRemovedBg,
                                        color: token.added ? colors.inlineAddedText : colors.inlineRemovedText,
                                    }}>
                                        {restOfToken}
                                    </Text>
                                </Text>
                            );
                        }
                        return (
                            <Text key={idx}>
                                <Text style={{ color: colors.leadingSpaceDot }}>{leadingDots}</Text>
                                <Text style={{ color: baseColor }}>{restOfToken}</Text>
                            </Text>
                        );
                    }
                    processedLeadingSpaces = true;
                }

                if (token.added || token.removed) {
                    return (
                        <Text
                            key={idx}
                            style={{
                                backgroundColor: token.added ? colors.inlineAddedBg : colors.inlineRemovedBg,
                                color: token.added ? colors.inlineAddedText : colors.inlineRemovedText,
                            }}
                        >
                            {token.value}
                        </Text>
                    );
                }
                return <Text key={idx} style={{ color: baseColor }}>{token.value}</Text>;
            });
        }

        // Use syntax highlighting if language is set
        if (syntaxColors && language) {
            return renderSyntaxLineContent(content);
        }

        // Regular rendering without tokens
        const leadingSpaces = formatted.match(/^( +)/);
        const leadingDots = leadingSpaces ? '\u00b7'.repeat(leadingSpaces[0].length) : '';
        const mainContent = leadingSpaces ? formatted.slice(leadingSpaces[0].length) : formatted;

        return (
            <>
                {leadingDots && <Text style={{ color: colors.leadingSpaceDot }}>{leadingDots}</Text>}
                <Text style={{ color: baseColor }}>{mainContent}</Text>
            </>
        );
    };

    // Render diff content as separate lines to prevent wrapping
    const renderDiffContent = () => {
        const lines: React.ReactNode[] = [];

        hunks.forEach((hunk, hunkIndex) => {
            // Add hunk header for non-first hunks
            if (hunkIndex > 0) {
                lines.push(
                    <Text
                        key={`hunk-header-${hunkIndex}`}
                        numberOfLines={wrapLines ? undefined : 1}
                        style={{
                            ...Typography.mono(),
                            fontSize: 12,
                            color: colors.hunkHeaderText,
                            backgroundColor: colors.hunkHeaderBg,
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            transform: [{ scaleX: fontScaleX }],
                        }}
                    >
                        {`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`}
                    </Text>
                );
            }

            hunk.lines.forEach((line, lineIndex) => {
                const isAdded = line.type === 'add';
                const isRemoved = line.type === 'remove';
                const textColor = isAdded ? colors.addedText : isRemoved ? colors.removedText : colors.contextText;
                const bgColor = isAdded ? colors.addedBg : isRemoved ? colors.removedBg : colors.contextBg;

                // Render complete line in a single Text element
                lines.push(
                    <Text
                        key={`line-${hunkIndex}-${lineIndex}`}
                        numberOfLines={wrapLines ? undefined : 1}
                        style={{
                            ...Typography.mono(),
                            fontSize: 13,
                            lineHeight: 20,
                            backgroundColor: bgColor,
                            transform: [{ scaleX: fontScaleX }],
                            paddingLeft: 8,
                            paddingRight: 8,
                        }}
                    >
                        {showLineNumbers && (
                            <Text style={{
                                color: colors.lineNumberText,
                                backgroundColor: colors.lineNumberBg,
                            }}>
                                {String(line.type === 'remove' ? line.oldLineNumber :
                                       line.type === 'add' ? line.newLineNumber :
                                       line.oldLineNumber).padStart(3, ' ')}
                            </Text>
                        )}
                        {showPlusMinusSymbols && (
                            <Text style={{ color: textColor }}>
                                {` ${isAdded ? '+' : isRemoved ? '-' : ' '} `}
                            </Text>
                        )}
                        {renderLineContent(line.content, textColor, line.tokens)}
                    </Text>
                );
            });
        });

        return lines;
    };

    return (
        <View style={[containerStyle, { overflow: 'hidden' }]}>
            {renderDiffContent()}
        </View>
    );
};
