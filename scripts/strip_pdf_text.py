"""Supprime la couche texte d'un PDF tout en gardant les images et vecteurs.

Hypothèse: Mistral OCR utilise parfois la couche texte comme hint pour
l'ordre de lecture. Sur un PDF multi-colonnes, la couche texte du
publisher peut imposer un ordre interleavé. En retirant la couche texte,
on force Mistral à faire de la vision pure et à redécouvrir l'ordre
correct depuis le layout visuel.

Usage: strip_pdf_text.py <pdf_in> <pdf_out>
"""
import sys
import fitz  # PyMuPDF


def strip_text_layer(pdf_in: str, pdf_out: str) -> None:
    doc = fitz.open(pdf_in)
    for page in doc:
        # Annotation de rédaction sur toute la page. apply_redactions vire
        # le texte couvert ; on demande explicitement à préserver images
        # et line-art.
        page.add_redact_annot(page.rect)
        page.apply_redactions(
            images=fitz.PDF_REDACT_IMAGE_NONE,
            graphics=fitz.PDF_REDACT_LINE_ART_NONE,
        )
    # ez_save garbage-collecte et compresse.
    doc.ez_save(pdf_out)
    doc.close()


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(1)
    strip_text_layer(sys.argv[1], sys.argv[2])


if __name__ == '__main__':
    main()
