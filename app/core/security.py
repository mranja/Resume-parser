import re
from typing import Optional
from fastapi import Header, HTTPException, status
from app.config import get_settings

PDF_MAGIC_BYTES = b"%PDF-"


def validate_pdf_content(file_bytes: bytes, max_mb: int) -> None:
    max_bytes = max_mb * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of {max_mb} MB.",
        )
    if len(file_bytes) < 5 or not file_bytes.startswith(PDF_MAGIC_BYTES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is not a valid PDF document (invalid magic header).",
        )


def mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return "[REDACTED_EMAIL]"
    parts = email.split("@")
    user = parts[0]
    domain = parts[1]
    if len(user) <= 2:
        masked_user = user[0] + "*"
    else:
        masked_user = user[0] + "*" * (len(user) - 2) + user[-1]
    return f"{masked_user}@{domain}"


def mask_phone(phone: Optional[str]) -> str:
    if not phone:
        return "[REDACTED_PHONE]"
    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 4:
        return f"***-***-{digits[-4:]}"
    return "***-***-****"


def mask_name(name: str) -> str:
    if not name:
        return "Candidate [REDACTED]"
    parts = name.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1][0]}."
    return f"Candidate {name[:2]}***"


def check_recruiter_auth(authorization: Optional[str] = Header(None, alias="Authorization")) -> bool:
    settings = get_settings()
    if not settings.require_auth:
        return True
    
    expected_key = settings.recruiter_api_key
    if not expected_key:
        return True

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Recruiter authentication required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.replace("Bearer ", "").strip()
    if token != expected_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid recruiter credentials.",
        )
    return True
