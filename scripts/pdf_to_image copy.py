import sys
import os
import json
import fitz  # PyMuPDF
from PIL import Image

def extract_article_to_image(pdf_path, output_path, article, article_index, scale=3):
    """Extract zones from an article and combine them into a single image."""
    zones = article['zones']

    if not zones:
        return

    doc = fitz.open(pdf_path)
    zone_images = []

    for zone in zones:
        # Pages are 1-indexed in the app, 0-indexed in PyMuPDF
        page_num = zone['page'] - 1
        if page_num < 0 or page_num >= len(doc):
            continue

        page = doc[page_num]

        # Get page dimensions
        page_rect = page.rect
        width = page_rect.width
        height = page_rect.height

        # Convert normalized coordinates to actual coordinates
        x1 = zone['x1'] * width
        y1 = zone['y1'] * height
        x2 = zone['x2'] * width
        y2 = zone['y2'] * height

        # Create rectangle for the zone
        clip_rect = fitz.Rect(x1, y1, x2, y2)

        # Render zone to image
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, clip=clip_rect)

        # Convert to PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        zone_images.append(img)

    doc.close()

    # Combine vertically
    if not zone_images:
        return

    total_height = sum(img.height for img in zone_images)
    max_width = max(img.width for img in zone_images)

    combined = Image.new('RGB', (max_width, total_height), (255, 255, 255))

    current_y = 0
    for img in zone_images:
        combined.paste(img, (0, current_y))
        current_y += img.height

    # Save with article index
    image_path = os.path.join(output_path, f'article_{article_index + 1}.png')
    combined.save(image_path)
    print(f"Saved: {image_path}")

def main():
    if len(sys.argv) < 4:
        print("Usage: python pdf_to_image.py <pdf_path> <output_folder> <articles_json>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    articles_json = sys.argv[3]

    # Parse articles
    try:
        articles = json.loads(articles_json)
    except json.JSONDecodeError as e:
        print(f"Error parsing JSON: {e}")
        sys.exit(1)

    # Create output directory
    os.makedirs(output_path, exist_ok=True)

    # Process each article
    for index, article in enumerate(articles):
        extract_article_to_image(pdf_path, output_path, article, index)

    print(f"Exported {len(articles)} article(s)")

if __name__ == '__main__':
    main()
