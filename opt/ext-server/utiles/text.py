import re


class MarkdownCleaner:
    """Strip markdown formatting to produce clean plain text for TTS."""

    @staticmethod
    def clean_markdown(text: str) -> str:
        if not text:
            return text

        # Code blocks (```...```) — replace with content if short, else remove
        text = re.sub(r'```[\s\S]*?```', _extract_code_block, text)

        # Inline code (`...`)
        text = re.sub(r'`([^`]+)`', r'\1', text)

        # Images ![alt](url)
        text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', r'\1', text)

        # Links [text](url) → text
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)

        # Headings (# ## ### etc.)
        text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

        # Bold+italic (***text*** or ___text___)
        text = re.sub(r'(\*{3}|_{3})(.+?)\1', r'\2', text)

        # Bold (**text** or __text__)
        text = re.sub(r'(\*{2}|_{2})(.+?)\1', r'\2', text)

        # Italic (*text* or _text_) — only single markers
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'\1', text)
        text = re.sub(r'(?<!_)_(?!_)(.+?)(?<!_)_(?!_)', r'\1', text)

        # Strikethrough (~~text~~)
        text = re.sub(r'~~(.+?)~~', r'\1', text)

        # Blockquotes (> ...)
        text = re.sub(r'^>\s?', '', text, flags=re.MULTILINE)

        # Horizontal rules (---, ***, ___)
        text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)

        # Unordered list markers (-, *, +)
        text = re.sub(r'^[\-\*\+]\s+', '', text, flags=re.MULTILINE)

        # Ordered list markers (1. 2. etc.)
        text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)

        # HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Collapse multiple blank lines into one
        text = re.sub(r'\n{3,}', '\n\n', text)

        return text.strip()


def _extract_code_block(match: re.Match) -> str:
    """Extract code block content, keep if short enough for TTS."""
    content = match.group(0)
    # Remove the ``` fences
    lines = content.split('\n')
    if len(lines) <= 3:
        # Short code block — keep the content
        body = '\n'.join(lines[1:-1])
        return body
    return ''
