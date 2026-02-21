"""
PDF Generator — convert DOCX to PDF.

Strategy (in order of preference):
  1. LibreOffice CLI ('soffice') — most reliable, pixel-perfect
  2. docx2pdf (uses Word on macOS/Windows) — good fallback
  3. Returns an error if neither is available

LibreOffice is free and works headlessly on all platforms.
Install: brew install libreoffice (macOS) / apt install libreoffice (Linux)
"""

from __future__ import annotations

import io
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


def docx_to_pdf(docx_buffer: io.BytesIO) -> io.BytesIO:
    """
    Convert a DOCX BytesIO buffer to a PDF BytesIO buffer.

    Raises RuntimeError if conversion fails or no converter is available.
    """
    # Try LibreOffice first, then docx2pdf
    for converter in [_convert_libreoffice, _convert_docx2pdf]:
        try:
            result = converter(docx_buffer)
            if result:
                return result
        except Exception as e:
            logger.warning(f"{converter.__name__} failed: {e}")
            continue

    raise RuntimeError(
        "PDF conversion failed. Install LibreOffice (brew install libreoffice) "
        "or docx2pdf (pip install docx2pdf) for PDF generation."
    )


def is_pdf_converter_available() -> bool:
    """Check if any PDF converter is available on the system."""
    return _has_libreoffice() or _has_docx2pdf()


def _has_libreoffice() -> bool:
    """Check if LibreOffice CLI is available."""
    return shutil.which("soffice") is not None or shutil.which("libreoffice") is not None


def _has_docx2pdf() -> bool:
    """Check if docx2pdf Python package is available."""
    try:
        import docx2pdf  # noqa: F401
        return True
    except ImportError:
        return False


def _convert_libreoffice(docx_buffer: io.BytesIO) -> io.BytesIO | None:
    """Convert DOCX to PDF using LibreOffice CLI (headless)."""
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = Path(tmp_dir) / "resume.docx"
        pdf_path = Path(tmp_dir) / "resume.pdf"

        # Write DOCX to temp file
        docx_buffer.seek(0)
        docx_path.write_bytes(docx_buffer.read())

        # Run LibreOffice headless conversion
        cmd = [
            soffice,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", str(tmp_dir),
            str(docx_path),
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                env={**os.environ, "HOME": tmp_dir},  # Avoid profile lock
            )
            if result.returncode != 0:
                logger.warning(f"LibreOffice exited with code {result.returncode}: {result.stderr}")
                return None
        except subprocess.TimeoutExpired:
            logger.warning("LibreOffice conversion timed out (30s)")
            return None

        if not pdf_path.exists():
            logger.warning(f"LibreOffice did not produce {pdf_path}")
            return None

        # Read PDF into buffer
        pdf_buffer = io.BytesIO(pdf_path.read_bytes())
        pdf_buffer.seek(0)
        logger.info(f"PDF generated via LibreOffice ({pdf_buffer.getbuffer().nbytes} bytes)")
        return pdf_buffer


def _convert_docx2pdf(docx_buffer: io.BytesIO) -> io.BytesIO | None:
    """Convert DOCX to PDF using the docx2pdf Python package."""
    try:
        from docx2pdf import convert as docx2pdf_convert
    except ImportError:
        return None

    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = Path(tmp_dir) / "resume.docx"
        pdf_path = Path(tmp_dir) / "resume.pdf"

        docx_buffer.seek(0)
        docx_path.write_bytes(docx_buffer.read())

        try:
            docx2pdf_convert(str(docx_path), str(pdf_path))
        except Exception as e:
            logger.warning(f"docx2pdf conversion failed: {e}")
            return None

        if not pdf_path.exists():
            return None

        pdf_buffer = io.BytesIO(pdf_path.read_bytes())
        pdf_buffer.seek(0)
        logger.info(f"PDF generated via docx2pdf ({pdf_buffer.getbuffer().nbytes} bytes)")
        return pdf_buffer
