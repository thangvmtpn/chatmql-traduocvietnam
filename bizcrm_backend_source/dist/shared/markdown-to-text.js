/**
 * markdown-to-text.ts — convert markdown to clean plain text.
 *
 * Messages are delivered to Zalo (personal/OA chat), which renders NO markdown:
 * `**bold**`, `# headings`, `[text](url)` etc. would show up literally to the
 * customer. We normalize AI output to plain text so the customer (and the staff
 * inbox) see clean, consistent text. Mirrors flowbot's facebookTools approach
 * for plain-text channels.
 */
/**
 * Strip markdown formatting while preserving content.
 * - bold/italic/strikethrough/inline-code → plain text
 * - links [t](u) → "t (u)"; images ![a](u) → removed
 * - headings/blockquotes → plain line; horizontal rules → removed
 * - unordered/ordered lists → "• item" bullets
 */
export function markdownToPlainText(markdown) {
    if (!markdown)
        return '';
    let text = markdown;
    // Code blocks (```lang\n…```) → inner content
    text = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-z]*\n?/gi, '').replace(/```/g, ''));
    // Inline code `code`
    text = text.replace(/`([^`]+)`/g, '$1');
    // Bold **text** / __text__
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    // Italic *text* / _text_
    text = text.replace(/\*([^*]+)\*/g, '$1');
    text = text.replace(/_([^_]+)_/g, '$1');
    // Strikethrough ~~text~~
    text = text.replace(/~~([^~]+)~~/g, '$1');
    // Images ![alt](url) — drop (Zalo can't render markdown images)
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    // Links [text](url) → "text (url)"
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
    // Headings (# Heading) → plain line
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1');
    // Horizontal rules (---, ***, ___)
    text = text.replace(/^[\-*_]{3,}$/gm, '');
    // Unordered lists (-, *, +) → "• item"
    text = text.replace(/^[\s]*[-*+]\s+(.+)$/gm, '• $1');
    // Ordered lists (1., 2., …) → "• item"
    text = text.replace(/^[\s]*\d+\.\s+(.+)$/gm, '• $1');
    // Blockquotes (> text)
    text = text.replace(/^>\s+(.+)$/gm, '$1');
    // Collapse 3+ blank lines to a single blank line (keeps \n\n bubble splits)
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
}
//# sourceMappingURL=markdown-to-text.js.map