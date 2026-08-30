import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class TextChunk:
    chunk_index: int
    text: str
    section_name: Optional[str]
    token_count: int


SECTION_HEADERS = [
    ("experience", re.compile(r"\b(work\s+experience|professional\s+experience|employment|experience)\b", re.IGNORECASE)),
    ("education", re.compile(r"\b(education|academic\s+background|qualifications|degrees)\b", re.IGNORECASE)),
    ("skills", re.compile(r"\b(skills|technical\s+skills|core\s+competencies|technologies)\b", re.IGNORECASE)),
    ("projects", re.compile(r"\b(projects|personal\s+projects|key\s+projects|portfolio)\b", re.IGNORECASE)),
    ("certifications", re.compile(r"\b(certifications|certificates|licenses)\b", re.IGNORECASE)),
    ("summary", re.compile(r"\b(summary|profile|about\s+me|objective)\b", re.IGNORECASE)),
    ("requirements", re.compile(r"\b(requirements|qualifications|must-have|responsibilities)\b", re.IGNORECASE)),
]


def detect_section(text_line: str) -> Optional[str]:
    for section_name, pattern in SECTION_HEADERS:
        if pattern.search(text_line):
            return section_name
    return None


def chunk_document(
    text: str,
    max_chars: int = 450,
    overlap: int = 60,
) -> list[TextChunk]:
    if not text or not text.strip():
        return []

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    chunks: list[TextChunk] = []
    
    current_section = "overview"
    current_buffer: list[str] = []
    current_len = 0
    chunk_index = 0

    for line in lines:
        sec = detect_section(line)
        if sec:
            current_section = sec

        words = line.split()
        line_len = len(line)

        if current_len + line_len > max_chars and current_buffer:
            chunk_str = " ".join(current_buffer)
            chunks.append(
                TextChunk(
                    chunk_index=chunk_index,
                    text=chunk_str,
                    section_name=current_section,
                    token_count=len(chunk_str.split()),
                )
            )
            chunk_index += 1
            
            # Keep overlap
            overlap_words = chunk_str.split()[-max(1, overlap // 6):]
            current_buffer = [" ".join(overlap_words), line]
            current_len = len(" ".join(current_buffer))
        else:
            current_buffer.append(line)
            current_len += line_len + 1

    if current_buffer:
        chunk_str = " ".join(current_buffer)
        chunks.append(
            TextChunk(
                chunk_index=chunk_index,
                text=chunk_str,
                section_name=current_section,
                token_count=len(chunk_str.split()),
            )
        )

    return chunks
