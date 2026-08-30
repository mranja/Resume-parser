import re
import unicodedata
from pathlib import Path
from pypdf import PdfReader


def clean_resume_text(raw_text: str) -> str:
    if not raw_text:
        return ""

    # Normalize unicode (NFKC)
    text = unicodedata.normalize("NFKC", raw_text)

    # Replace fancy bullets and typographic dashes
    text = re.sub(r"[\u2022\u2023\u25E6\u2043\u2219\u25CB\u25CF]", " • ", text)
    text = re.sub(r"[\u2013\u2014]", "-", text)
    text = re.sub(r"[\u2018\u2019]", "'", text)
    text = re.sub(r"[\u201C\u201D]", '"', text)

    # Fix de-hyphenation across line breaks (e.g., "imple-\nmentation" -> "implementation")
    text = re.sub(r"(\w+)-\s*\n\s*(\w+)", r"\1\2", text)

    # Standardize line breaks
    text = re.sub(r"\r\n|\r", "\n", text)

    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Normalize multiple horizontal spaces
    text = re.sub(r"[ \t]+", " ", text)

    return text.strip()


def extract_pdf_text(path: Path) -> str:
    try:
        reader = PdfReader(str(path))
    except Exception as exc:
        raise ValueError(f"Corrupted or invalid PDF file: {exc}") from exc

    if len(reader.pages) == 0:
        raise ValueError("PDF document contains no pages.")

    pages_text: list[str] = []
    for idx, page in enumerate(reader.pages):
        try:
            page_content = page.extract_text() or ""
            cleaned = clean_resume_text(page_content)
            if cleaned:
                pages_text.append(cleaned)
        except Exception:
            continue

    full_text = "\n\n".join(pages_text)
    if not full_text.strip():
        raise ValueError("No readable text found in the PDF. Scanned image resumes require OCR preprocessing.")

    return full_text
