import sys
import json
import fitz  # PyMuPDF
from PIL import Image

def extract_zones_to_image(config_file):
    with open(config_file, 'r') as f:
        config = json.load(f)

    pdf_path = config['pdfPath']
    zones = config['zones']
    output_path = config['outputPath']
    scale = config['scale']

    doc = fitz.open(pdf_path)
    zone_images = []

    for zone in zones:
        page_num = zone['page']
        page = doc[page_num]

        # Obtenir les dimensions de la page
        page_rect = page.rect
        width = page_rect.width
        height = page_rect.height

        # Convertir les coordonnées normalisées en coordonnées réelles
        x1 = zone['x1'] * width
        y1 = zone['y1'] * height
        x2 = zone['x2'] * width
        y2 = zone['y2'] * height

        # Créer un rectangle pour la zone
        clip_rect = fitz.Rect(x1, y1, x2, y2)

        # Rendre la zone en image
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, clip=clip_rect)

        # Convertir en PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        zone_images.append(img)

    doc.close()

    # Combiner verticalement
    if not zone_images:
        return

    total_height = sum(img.height for img in zone_images)
    max_width = max(img.width for img in zone_images)

    combined = Image.new('RGB', (max_width, total_height), (255, 255, 255))

    current_y = 0
    for img in zone_images:
        combined.paste(img, (0, current_y))
        current_y += img.height

    combined.save(output_path)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python pdf_to_image.py <config_file>")
        sys.exit(1)

    extract_zones_to_image(sys.argv[1])
