"""
Text cleanup utilities for raw resume text extraction.
"""

from __future__ import annotations

import re
import unicodedata


def normalize_text(text: str) -> str:
    """Normalize whitespace, strip bad unicode, and clean up raw extracted text."""
    # Normalize unicode (NFKD decomposes, then we strip combining marks)
    text = unicodedata.normalize("NFKC", text)

    # Replace common unicode replacements
    replacements = {
        "\u2019": "'",   # right single quote
        "\u2018": "'",   # left single quote
        "\u201c": '"',   # left double quote
        "\u201d": '"',   # right double quote
        "\u2013": "-",   # en-dash
        "\u2014": "-",   # em-dash
        "\u2026": "...", # ellipsis
        "\u00a0": " ",   # non-breaking space
        "\u200b": "",    # zero-width space
        "\ufeff": "",    # BOM
    }
    for old, new in replacements.items():
        text = text.replace(old, new)

    # Collapse multiple spaces into one
    text = re.sub(r"[ \t]+", " ", text)

    # Collapse 3+ consecutive newlines into 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Strip leading/trailing whitespace per line
    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(lines)

    return text.strip()


def extract_bullet_prefix(text: str) -> str:
    """Remove common bullet prefixes (•, -, *, ●, ○, ▪) from the start of text."""
    return re.sub(r"^[\s]*[•\-\*●○▪►▸‣⁃]\s*", "", text)
