import sys
import os
import json
import fitz  # PyMuPDF


def point_in_polygon(point, polygon):
    """Ray casting test. polygon = list of (x, y)."""
    x, y = point
    inside = False
    n = len(polygon)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        # Edge crosses the horizontal ray going right from (x, y)?
        if ((yi > y) != (yj > y)) and (
            x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def zone_bbox_normalized(zone):
    """Return (nx1, ny1, nx2, ny2) in 0-1 page coords, regardless of shape."""
    if zone.get('kind') == 'polygon':
        xs = [p[0] for p in zone['points']]
        ys = [p[1] for p in zone['points']]
        return min(xs), min(ys), max(xs), max(ys)
    return zone['x1'], zone['y1'], zone['x2'], zone['y2']


def extract_zone_to_page(src_doc, new_doc, zone):
    """Add a new page to new_doc containing the zone's content extracted from
    src_doc. Rect zones: simple vector clip. Polygon zones: vector clip on the
    bbox + word-level redaction outside polygon + white even-odd mask covering
    the bbox minus the polygon."""
    page_num = zone['page'] - 1
    if page_num < 0 or page_num >= len(src_doc):
        return

    src_page = src_doc[page_num]
    pw, ph = src_page.rect.width, src_page.rect.height

    nx1, ny1, nx2, ny2 = zone_bbox_normalized(zone)
    x1, y1 = nx1 * pw, ny1 * ph
    x2, y2 = nx2 * pw, ny2 * ph
    bbox = fitz.Rect(x1, y1, x2, y2)

    if bbox.width <= 0 or bbox.height <= 0:
        return

    new_page = new_doc.new_page(width=bbox.width, height=bbox.height)

    is_polygon = zone.get('kind') == 'polygon' and len(zone.get('points', [])) >= 3

    if not is_polygon:
        new_page.show_pdf_page(new_page.rect, src_doc, page_num, clip=bbox)
        return

    # Polygon coords in absolute page space
    poly_abs = [(p[0] * pw, p[1] * ph) for p in zone['points']]

    # Working copy of the source page so we don't mutate the input document
    work = fitz.open()
    work.insert_pdf(src_doc, from_page=page_num, to_page=page_num)
    work_page = work[0]

    # Redact words whose center sits outside the polygon (text layer only —
    # if the source has no text layer this loop iterates 0 times and the
    # final result is purely the white mask over a vector image clip).
    for w in work_page.get_text("words"):
        wx0, wy0, wx1, wy1 = w[:4]
        # Cheap reject: word entirely outside the bbox = will be cropped by
        # show_pdf_page anyway, no point redacting it.
        if wx1 < x1 or wx0 > x2 or wy1 < y1 or wy0 > y2:
            continue
        cx, cy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
        if not point_in_polygon((cx, cy), poly_abs):
            # fill=(1,1,1): redaction marker is white. Irrelevant visually
            # since the white couronne sits on top, but avoids the default
            # black bar peeking through if the couronne path has any gap.
            work_page.add_redact_annot(
                fitz.Rect(wx0, wy0, wx1, wy1), fill=(1, 1, 1)
            )
    # images=PDF_REDACT_IMAGE_NONE: don't re-encode the page's embedded scan.
    # Default behavior decompresses the scan, paints redactions onto pixels,
    # and stores it back as Flate (no JPEG) — 20x file size on scanned PDFs.
    # The white even-odd mask below already hides text visually; redactions
    # here only need to strip the OCR text layer.
    work_page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

    # Vector copy of the (now-redacted) bbox content
    new_page.show_pdf_page(new_page.rect, work, 0, clip=bbox)

    # White even-odd mask. The shape contains two subpaths: the outer rect
    # (= the whole new page) and the polygon. With even-odd fill, only the
    # area between them gets painted — the polygon interior stays untouched.
    poly_local = [(p[0] - x1, p[1] - y1) for p in poly_abs]
    shape = new_page.new_shape()
    shape.draw_rect(new_page.rect)
    shape.draw_polyline(poly_local + [poly_local[0]])
    shape.finish(fill=(1, 1, 1), color=None, even_odd=True, closePath=True)
    shape.commit()

    work.close()


def extract_article_to_pdf(pdf_path, output_path, article, article_index):
    zones = article['zones']
    if not zones:
        return

    src_doc = fitz.open(pdf_path)
    new_doc = fitz.open()

    for zone in zones:
        extract_zone_to_page(src_doc, new_doc, zone)

    src_doc.close()

    pdf_output_path = os.path.join(output_path, f'article_{article_index + 1}.pdf')
    new_doc.save(pdf_output_path)
    new_doc.close()
    print(f"Saved PDF: {pdf_output_path}")


def main():
    if len(sys.argv) < 4:
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    articles_json_path = sys.argv[3]

    try:
        with open(articles_json_path, 'r', encoding='utf-8') as f:
            articles = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading articles: {e}")
        sys.exit(1)

    os.makedirs(output_path, exist_ok=True)

    for index, article in enumerate(articles):
        extract_article_to_pdf(pdf_path, output_path, article, index)


if __name__ == '__main__':
    main()
