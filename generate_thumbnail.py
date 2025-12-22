import sys
import json
import fitz  # PyMuPDF
from PIL import Image

def generate_thumbnail(pdf_path, output_path, width=300):
    """
    Génère une miniature de la première page d'un PDF

    Args:
        pdf_path: Chemin vers le fichier PDF
        output_path: Chemin de sortie pour la miniature
        width: Largeur désirée de la miniature (default: 300px)
    """
    try:
        # Ouvrir le PDF
        doc = fitz.open(pdf_path)

        if len(doc) == 0:
            raise Exception("Le PDF ne contient aucune page")

        # Première page
        page = doc[0]

        # Calculer le facteur de zoom pour obtenir la largeur désirée
        page_rect = page.rect
        zoom = width / page_rect.width

        # Créer la matrice de transformation
        mat = fitz.Matrix(zoom, zoom)

        # Rendre la page en image
        pix = page.get_pixmap(matrix=mat)

        # Convertir en PIL Image
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # Sauvegarder
        img.save(output_path, 'PNG', optimize=True)

        doc.close()

        return {
            'success': True,
            'width': pix.width,
            'height': pix.height
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(json.dumps({'success': False, 'error': 'Usage: python generate_thumbnail.py <config.json>'}))
        sys.exit(1)

    config_path = sys.argv[1]

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)

        result = generate_thumbnail(
            config['pdfPath'],
            config['outputPath'],
            config.get('width', 300)
        )

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)
