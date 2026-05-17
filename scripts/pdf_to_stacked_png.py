"""Render a PDF to a single stacked PNG (all pages concatenated vertically).

Usage:
    python pdf_to_stacked_png.py <input.pdf> <out.png> [<dpi>]

Used by the PNG export "per-element" mode: a multi-zone article produces one
PNG containing all the zones of its extract.pdf stacked top-to-bottom.
"""

import sys
import fitz  # PyMuPDF
from PIL import Image


def main():
    if len(sys.argv) < 3:
        sys.exit(1)
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]
    dpi = int(sys.argv[3]) if len(sys.argv) >= 4 else 200

    doc = fitz.open(pdf_path)
    try:
        if len(doc) == 0:
            sys.exit(1)
        if len(doc) == 1:
            # Fast path: single page, just save it as PNG directly.
            doc[0].get_pixmap(dpi=dpi, alpha=False).save(out_path)
            return

        # Render every page to a PIL Image. Pad narrower pages with white.
        page_images = []
        for page in doc:
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            page_images.append(img)

        max_w = max(img.width for img in page_images)
        total_h = sum(img.height for img in page_images)

        out = Image.new('RGB', (max_w, total_h), 'white')
        y = 0
        for img in page_images:
            # Center narrower pages horizontally — keeps the visual balanced
            # when zones have different widths.
            x = (max_w - img.width) // 2
            out.paste(img, (x, y))
            y += img.height

        out.save(out_path)
    finally:
        doc.close()


if __name__ == '__main__':
    main()
