"""
Google Drive Service — OAuth2 authentication, folder listing, file downloads.

Responsibilities:
  • Generate OAuth2 consent URL for Google Drive read-only scope
  • Handle OAuth callback and store credentials
  • Parse folder IDs from Google Drive share links
  • List PDF/DOCX files in a folder
  • Download individual files as bytes
"""

from __future__ import annotations

import logging
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
import io
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)

# Scopes: read-only access to Drive files
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# File types we accept from Drive
ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
}

# Allowed file extensions (fallback check)
ALLOWED_EXTENSIONS = {"pdf", "docx", "doc"}

# Module-level credential store (session-scoped, like resume cache)
_credentials: Any = None

# Token persistence path
_TOKEN_PATH = Path("data/drive_token.json")


# ── OAuth2 Flow ─────────────────────────────────────────────────────────────


def _build_client_config() -> dict[str, Any]:
    """Build OAuth2 client config from env settings."""
    if not settings.google_client_id or not settings.google_client_secret:
        raise ValueError(
            "Google Drive credentials not configured. "
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file."
        )
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [f"{settings.frontend_url}/drive-callback"],
        }
    }


def get_auth_url() -> str:
    """Generate the Google OAuth2 consent URL.

    Returns the URL that the frontend should open in a popup for user consent.
    """
    client_config = _build_client_config()
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=f"{settings.frontend_url}/drive-callback",
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def handle_auth_callback(code: str) -> bool:
    """Exchange the authorization code for credentials.

    Args:
        code: The authorization code from Google's OAuth callback.

    Returns:
        True if credentials were successfully obtained.
    """
    global _credentials

    client_config = _build_client_config()
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=f"{settings.frontend_url}/drive-callback",
    )
    flow.fetch_token(code=code)
    _credentials = flow.credentials

    # Persist token for session reuse
    try:
        _TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        if _credentials is not None:
            _TOKEN_PATH.write_text(_credentials.to_json())
        logger.info("Google Drive token saved")
    except Exception as e:
        logger.warning(f"Could not persist Drive token: {e}")

    logger.info("Google Drive authentication successful")
    return True


def is_authenticated() -> bool:
    """Check if we have valid Google Drive credentials."""
    global _credentials

    if _credentials and _credentials.valid:
        return True

    # Try to refresh expired credentials
    if _credentials and _credentials.expired and _credentials.refresh_token:
        try:
            from google.auth.transport.requests import Request
            _credentials.refresh(Request())
            return True
        except Exception:
            _credentials = None
            return False

    # Try loading from persisted token
    if _TOKEN_PATH.exists():
        try:
            _credentials = Credentials.from_authorized_user_file(
                str(_TOKEN_PATH), SCOPES
            )
            if _credentials.valid:
                return True
            if _credentials.expired and _credentials.refresh_token:
                from google.auth.transport.requests import Request
                _credentials.refresh(Request())
                return True
        except Exception:
            _credentials = None

    return False


def disconnect() -> None:
    """Clear stored credentials."""
    global _credentials
    _credentials = None
    if _TOKEN_PATH.exists():
        _TOKEN_PATH.unlink()
    logger.info("Google Drive disconnected")


# ── Drive Operations ────────────────────────────────────────────────────────


def _get_drive_service():
    """Build a Google Drive API v3 service instance."""
    if not _credentials:
        raise ValueError("Not authenticated with Google Drive")
    return build("drive", "v3", credentials=_credentials)


def parse_folder_id(link: str) -> str:
    """Extract the folder ID from a Google Drive folder link.

    Supports formats:
      - https://drive.google.com/drive/folders/FOLDER_ID
      - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
      - https://drive.google.com/drive/u/0/folders/FOLDER_ID
      - Raw folder ID string

    Returns:
        The extracted folder ID.

    Raises:
        ValueError: If the link format is not recognized.
    """
    link = link.strip()

    # Try to extract from URL pattern
    patterns = [
        r"drive\.google\.com/drive(?:/u/\d+)?/folders/([a-zA-Z0-9_-]+)",
        r"drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)",
        r"drive\.google\.com/folderview\?id=([a-zA-Z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, link)
        if match:
            return match.group(1)

    # If it looks like a raw folder ID (alphanumeric + dashes/underscores, 20+ chars)
    if re.match(r"^[a-zA-Z0-9_-]{15,}$", link):
        return link

    raise ValueError(
        f"Could not extract folder ID from link: {link}. "
        "Please provide a Google Drive folder URL or folder ID."
    )


def list_files_in_folder(folder_id: str) -> list[dict[str, str]]:
    """List PDF and DOCX files in a Google Drive folder.

    Args:
        folder_id: The Google Drive folder ID.

    Returns:
        List of dicts with keys: id, name, mimeType, size
    """
    service = _get_drive_service()

    # Query for files in the folder
    query = f"'{folder_id}' in parents and trashed = false"
    results: list[dict[str, str]] = []

    page_token = None
    while True:
        response = service.files().list(
            q=query,
            fields="nextPageToken, files(id, name, mimeType, size)",
            pageSize=100,
            pageToken=page_token,
        ).execute()

        files = response.get("files", [])
        for f in files:
            mime = f.get("mimeType", "")
            name = f.get("name", "")
            ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""

            # Accept by MIME type or file extension
            if mime in ALLOWED_MIME_TYPES or ext in ALLOWED_EXTENSIONS:
                results.append({
                    "id": f["id"],
                    "name": f["name"],
                    "mimeType": mime,
                    "size": f.get("size", "0"),
                })
            else:
                logger.debug(f"Skipping non-resume file: {name} ({mime})")

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    logger.info(
        f"Found {len(results)} resume files in Drive folder {folder_id} "
        f"(out of {sum(len(response.get('files', [])) for _ in [1])} total)"
    )
    return results


def download_file(file_id: str, file_name: str) -> bytes:
    """Download a file from Google Drive.

    Args:
        file_id: The Google Drive file ID.
        file_name: The file name (for logging).

    Returns:
        The file contents as bytes.
    """
    service = _get_drive_service()

    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()
        if status:
            logger.debug(f"Downloading {file_name}: {int(status.progress() * 100)}%")

    logger.info(f"Downloaded {file_name} ({buffer.tell()} bytes)")
    buffer.seek(0)
    return buffer.read()
