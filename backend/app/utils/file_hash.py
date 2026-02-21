"""
File hashing utility — MD5 hash for dedup and change detection.
"""

import hashlib


def md5_hash(data: bytes) -> str:
    """Return hex MD5 digest of raw bytes."""
    return hashlib.md5(data).hexdigest()
