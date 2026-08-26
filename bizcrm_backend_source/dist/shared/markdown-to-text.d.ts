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
export declare function markdownToPlainText(markdown: string): string;
