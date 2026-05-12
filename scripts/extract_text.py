"""Extrait le texte d'un PDF (toutes les pages) avec reflow des paragraphes.

Usage: extract_text.py <pdf_path> <output_path>
"""
import sys
import fitz  # PyMuPDF


SENTENCE_ENDINGS = '.!?»":;'


def reflow_text(text):
    """Reflow : joint les soft-wraps tout en preservant les paragraphes."""
    lines = text.split('\n')
    paragraphs = []
    current = ''

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(current)
                current = ''
            continue

        if not current:
            current = stripped
        elif current.endswith('-'):
            current = current[:-1] + stripped
        else:
            current = current + ' ' + stripped

        if stripped[-1] in SENTENCE_ENDINGS:
            paragraphs.append(current)
            current = ''

    if current:
        paragraphs.append(current)

    return '\n\n'.join(paragraphs)


def extract_text_from_pdf(pdf_path):
    doc = fitz.open(pdf_path)
    parts = []
    for page in doc:
        raw = page.get_text("text").strip()
        if raw:
            parts.append(reflow_text(raw))
    doc.close()
    return '\n\n'.join(parts)


def main():
    if len(sys.argv) < 3:
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]

    text = extract_text_from_pdf(pdf_path)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(text)


if __name__ == '__main__':
    main()
