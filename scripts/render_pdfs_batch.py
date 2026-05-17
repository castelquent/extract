"""Batch-render multiple PDFs in one Python process — much faster on Windows
where each `spawn(python.exe)` carries ~300ms of startup overhead.

Usage:
    python render_pdfs_batch.py <manifest.json>

Manifest is a JSON array of:
    {"kind": "pages",   "pdf": "...", "outDir": "...",  "dpi": 200}
    {"kind": "stacked", "pdf": "...", "outPath": "...", "dpi": 200}

"pages":   writes outDir/page_001.png, page_002.png, ...
"stacked": writes a single outPath with all pages concatenated vertically.

Prints one "progress\\t<i>\\t<n>" line to stdout after each item completes, so
the spawning side can stream progress updates back to the renderer.
"""

import sys
import os
import json
import fitz  # PyMuPDF
from PIL import Image


def render_pages(pdf_path, out_dir, dpi):
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    try:
        for i, page in enumerate(doc):
            pix = page.get_pixmap(dpi=dpi, alpha=False)
            pix.save(os.path.join(out_dir, f'page_{i + 1:03d}.png'))
    finally:
        doc.close()


def render_stacked(pdf_path, out_path, dpi):
    parent = os.path.dirname(out_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    doc = fitz.open(pdf_path)
    try:
        if len(doc) == 0:
            return
        if len(doc) == 1:
            doc[0].get_pixmap(dpi=dpi, alpha=False).save(out_path)
            return
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
            x = (max_w - img.width) // 2
            out.paste(img, (x, y))
            y += img.height
        out.save(out_path)
    finally:
        doc.close()


def main():
    if len(sys.argv) < 2:
        sys.exit(1)
    with open(sys.argv[1], 'r', encoding='utf-8') as f:
        items = json.load(f)
    total = len(items)
    for i, item in enumerate(items):
        try:
            kind = item.get('kind', 'pages')
            dpi = int(item.get('dpi', 200))
            if kind == 'pages':
                render_pages(item['pdf'], item['outDir'], dpi)
            elif kind == 'stacked':
                render_stacked(item['pdf'], item['outPath'], dpi)
        except Exception as e:
            # Don't abort the batch on a single failure — log and continue so
            # the rest of the export still goes through.
            print(f'error\t{i}\t{e}', flush=True)
        print(f'progress\t{i + 1}\t{total}', flush=True)


if __name__ == '__main__':
    main()
