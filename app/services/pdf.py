from pathlib import Path

from pypdf import PdfReader


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(page.strip() for page in pages if page.strip())
    if not text:
        raise ValueError("No readable text found in the PDF. Scanned image resumes need OCR first.")
    return text
