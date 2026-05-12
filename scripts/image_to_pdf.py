import sys
import json
import fitz  # PyMuPDF
from PIL import Image

def image_to_pdf(image_path, output_path):
    """
    Convertit une image (JPG/PNG) en PDF

    Args:
        image_path: Chemin vers l'image source
        output_path: Chemin de sortie pour le PDF
    """
    try:
        # Ouvrir l'image avec PIL pour obtenir ses dimensions
        img = Image.open(image_path)

        # Convertir en RGB si nécessaire (pour les PNG avec transparence)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

        width, height = img.size

        # Créer un nouveau PDF
        doc = fitz.open()

        # Créer une page aux dimensions de l'image (en points, 72 dpi)
        # On garde les proportions mais on limite la taille max
        max_size = 1000  # points
        scale = min(max_size / width, max_size / height, 1)
        page_width = width * scale
        page_height = height * scale

        page = doc.new_page(width=page_width, height=page_height)

        # Insérer l'image
        rect = fitz.Rect(0, 0, page_width, page_height)
        page.insert_image(rect, filename=image_path)

        # Sauvegarder
        doc.save(output_path)
        doc.close()

        return {
            'success': True,
            'width': width,
            'height': height
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'success': False, 'error': 'Usage: python image_to_pdf.py <config.json>'}))
        sys.exit(1)

    config_path = sys.argv[1]

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        result = image_to_pdf(
            config['imagePath'],
            config['outputPath']
        )

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)
