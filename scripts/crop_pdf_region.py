"""Crop a rectangular region from a single PDF page to a JPEG file.

Used by the v2 in-editor image capture feature: the user draws a rect on a
page of the article's extract.pdf, this script renders the cropped region
to a raster image at the requested DPI.

Usage:
    python crop_pdf_region.py <config.json>

Config JSON shape:
    {
      "pdfPath": "...",
      "outputPath": "...",
      "page": 1,                 // 1-based
      "rect": { "x1": 0.1, "y1": 0.2, "x2": 0.5, "y2": 0.6 },  // 0-1 normalized
      "dpi": 200                 // optional, default 200
    }

Stdout: JSON {"success": bool, "width": int, "height": int, "error": str}
"""

import sys
import json
import fitz  # PyMuPDF


def crop_region(pdf_path, output_path, page_num, rect, dpi=200):
    doc = fitz.open(pdf_path)
    try:
        if page_num < 1 or page_num > len(doc):
            return {"success": False, "error": f"page {page_num} out of range"}

        page = doc[page_num - 1]
        pw, ph = page.rect.width, page.rect.height

        x1 = max(0.0, min(1.0, float(rect["x1"]))) * pw
        y1 = max(0.0, min(1.0, float(rect["y1"]))) * ph
        x2 = max(0.0, min(1.0, float(rect["x2"]))) * pw
        y2 = max(0.0, min(1.0, float(rect["y2"]))) * ph
        if x2 <= x1 or y2 <= y1:
            return {"success": False, "error": "empty rect"}

        clip = fitz.Rect(x1, y1, x2, y2)
        scale = dpi / 72.0
        matrix = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=matrix, clip=clip, alpha=False)
        pix.save(output_path, jpg_quality=85)
        return {"success": True, "width": pix.width, "height": pix.height}
    finally:
        doc.close()


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"success": False, "error": "Usage: crop_pdf_region.py <config.json>"}))
        sys.exit(1)

    config_path = sys.argv[1]
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        result = crop_region(
            cfg["pdfPath"],
            cfg["outputPath"],
            int(cfg["page"]),
            cfg["rect"],
            int(cfg.get("dpi", 200)),
        )
        print(json.dumps(result))
        if not result.get("success"):
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
