import sys
import os
import json
import fitz  # PyMuPDF

def extract_article_to_pdf(pdf_path, output_path, article, article_index):
    """Extrait les zones d'un article et les sauvegarde dans un mini-PDF propre."""
    zones = article['zones']
    if not zones:
        return

    doc = fitz.open(pdf_path)
    new_doc = fitz.open()  # Nouveau PDF vide

    for zone in zones:
        page_num = zone['page'] - 1
        if page_num < 0 or page_num >= len(doc):
            continue

        page = doc[page_num]
        width, height = page.rect.width, page.rect.height

        # Coordonnées réelles
        x1, y1 = zone['x1'] * width, zone['y1'] * height
        x2, y2 = zone['x2'] * width, zone['y2'] * height
        
        # Création du rectangle de découpe
        clip_rect = fitz.Rect(x1, y1, x2, y2)

        # Création d'une nouvelle page dans le mini-PDF à la taille de la zone
        new_page = new_doc.new_page(width=clip_rect.width, height=clip_rect.height)
        
        # On insère la zone du PDF original dans la nouvelle page
        # show_pdf_page permet de garder la qualité vectorielle ou scan d'origine
        new_page.show_pdf_page(new_page.rect, doc, page_num, clip=clip_rect)

    doc.close()

    # Sauvegarde du mini-PDF
    pdf_output_path = os.path.join(output_path, f'article_{article_index + 1}.pdf')
    new_doc.save(pdf_output_path)
    new_doc.close()
    print(f"Saved PDF: {pdf_output_path}")

def main():
    if len(sys.argv) < 4:
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_path = sys.argv[2]
    articles_json = sys.argv[3]

    try:
        articles = json.loads(articles_json)
    except json.JSONDecodeError:
        sys.exit(1)

    os.makedirs(output_path, exist_ok=True)

    for index, article in enumerate(articles):
        extract_article_to_pdf(pdf_path, output_path, article, index)

if __name__ == '__main__':
    main()