"""Render every page of a PDF to a PNG file in the given output directory.

Usage:
    python pdf_to_png.py <input.pdf> <out_dir> [<dpi>]

Writes:
    out_dir/page_001.png, out_dir/page_002.png, ...

Used by the v2 export pipeline to embed an article's extract.pdf inside
PDF/DOCX outputs and to produce the PNG export format.
"""

import sys
import os
import fitz  # PyMuPDF


def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    pdf_path = sys.argv[1]
    out_dir = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) >= 4 else 200

    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    try:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            out_path = os.path.join(out_dir, f'page_{i + 1:03d}.png')
            pix.save(out_path)
    finally:
        doc.close()


if __name__ == '__main__':
    main()
