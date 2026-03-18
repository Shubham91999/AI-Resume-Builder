import io
import logging
import re
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.services.tailor_service import get_cached_tailored
from app.services.email_service import get_emails_for_tailor
from app.services.docx_builder import build_docx
from app.services.pdf_generator import docx_to_pdf, is_pdf_converter_available
from app.services.output_packager import package_outputs
from app.services.jd_service import get_cached_jd
from app.services.resume_service import get_cached_resume
from app.services.ats_scorer import score_resume
from app.utils.dependencies import verify_download_access, not_found_error

logger = logging.getLogger(__name__)
router = APIRouter()


def _safe_filename(name: str, company: str) -> str:
    """Build a safe filename from name + company."""
    raw = f"{name}_{company}_Resume".replace(" ", "_")
    return re.sub(r"[^\w\-.]", "", raw)


@router.get("/{tailor_id}/docx")
async def download_docx(tailor_id: str, _: None = Depends(verify_download_access)):
    """Download the tailored resume as DOCX."""
    tailored = get_cached_tailored(tailor_id)
    if not tailored:
        raise not_found_error("Tailored resume", tailor_id)

    buffer = build_docx(tailored)
    filename = _safe_filename(tailored.name, "Tailored") + ".docx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{tailor_id}/pdf")
async def download_pdf(tailor_id: str, _: None = Depends(verify_download_access)):
    """Download the tailored resume as PDF (converted from DOCX)."""
    tailored = get_cached_tailored(tailor_id)
    if not tailored:
        raise not_found_error("Tailored resume", tailor_id)

    if not is_pdf_converter_available():
        raise HTTPException(
            status_code=503,
            detail="No PDF converter available. Install LibreOffice (brew install libreoffice) or docx2pdf.",
        )

    # Build DOCX first, then convert to PDF
    docx_buffer = build_docx(tailored)
    try:
        pdf_buffer = docx_to_pdf(docx_buffer)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    filename = _safe_filename(tailored.name, "Tailored") + ".pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{tailor_id}/zip")
async def download_zip(tailor_id: str, _: None = Depends(verify_download_access)):
    """Download all outputs (DOCX + PDF + emails + ATS report) as a ZIP file."""
    tailored = get_cached_tailored(tailor_id)
    if not tailored:
        raise not_found_error("Tailored resume", tailor_id)

    base_name = _safe_filename(tailored.name, "Tailored")

    # Get JD for report
    jd = get_cached_jd(tailored.jd_id)

    # Get emails
    emails = get_emails_for_tailor(tailor_id)

    # Compute before/after scores for ATS report
    before_score = None
    after_score = None
    if jd:
        original = get_cached_resume(tailored.original_resume_id)
        if original:
            from app.api.tailor_routes import _tailored_to_parsed
            before_score = score_resume(jd, original)
            tailored_as_resume = _tailored_to_parsed(tailored)
            after_score = score_resume(jd, tailored_as_resume)

    # Use output packager if JD is available for full packaging
    if jd:
        zip_buffer = package_outputs(
            tailored=tailored,
            jd=jd,
            emails=emails,
            before_score=before_score,
            after_score=after_score,
        )
    else:
        # Fallback: simple ZIP without folder structure
        import zipfile
        docx_buffer = build_docx(tailored)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"{base_name}.docx", docx_buffer.read())
        zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{base_name}.zip"'},
    )


@router.get("/{tailor_id}/txt")
async def download_txt(tailor_id: str, _: None = Depends(verify_download_access)):
    """Download the tailored resume as ATS-optimized plain text."""
    tailored = get_cached_tailored(tailor_id)
    if not tailored:
        raise not_found_error("Tailored resume", tailor_id)

    content = _build_resume_txt(tailored)
    filename = _safe_filename(tailored.name, "Tailored") + ".txt"

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_resume_txt(tailored) -> str:
    """Format a TailoredResume as ATS-optimized plain text."""
    lines: list[str] = []

    lines.append(tailored.name.upper())
    lines.append("=" * max(len(tailored.name), 40))

    contact = tailored.contact or {}
    contact_parts = [v for k in ("email", "phone", "location", "linkedin") if (v := contact.get(k))]
    if contact_parts:
        lines.append(" | ".join(contact_parts))
    lines.append("")

    if tailored.tagline:
        lines.append(tailored.tagline)
        lines.append("")

    if tailored.summary:
        lines.append("SUMMARY")
        lines.append("-" * 7)
        lines.append(tailored.summary)
        lines.append("")

    if tailored.skills:
        lines.append("SKILLS")
        lines.append("-" * 6)
        for category, skill_list in tailored.skills.items():
            lines.append(f"{category}: {skill_list}")
        lines.append("")

    if tailored.experience:
        lines.append("EXPERIENCE")
        lines.append("-" * 10)
        for exp in tailored.experience:
            lines.append(f"{exp.title} | {exp.company} | {exp.dates}")
            for bullet in exp.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if tailored.projects:
        lines.append("PROJECTS")
        lines.append("-" * 8)
        for proj in tailored.projects:
            lines.append(proj.name)
            for bullet in proj.bullets:
                lines.append(f"- {bullet}")
            lines.append("")

    if tailored.education:
        lines.append("EDUCATION")
        lines.append("-" * 9)
        for edu in tailored.education:
            if isinstance(edu, dict):
                parts = [str(edu[k]) for k in ("degree", "school", "year") if edu.get(k)]
                lines.append(" | ".join(parts))
        lines.append("")

    if tailored.certifications:
        lines.append("CERTIFICATIONS")
        lines.append("-" * 14)
        for cert in tailored.certifications:
            lines.append(f"- {cert}")
        lines.append("")

    return "\n".join(lines)


def _format_email_txt(subject: str, body: str, target: str) -> str:
    """Format an email as a plain text file."""
    return f"""{'='*60}
Cold Email — {target}
{'='*60}

Subject: {subject}

{body}

{'='*60}
Generated by AI Resume Tailor
"""
