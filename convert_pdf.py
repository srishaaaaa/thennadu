import fitz  # PyMuPDF
import sys

def pdf_to_png(pdf_path, output_path, zoom_x=2.0, zoom_y=2.0):
    try:
        doc = fitz.open(pdf_path)
        page = doc.load_page(0)  # first page
        mat = fitz.Matrix(zoom_x, zoom_y)
        pix = page.get_pixmap(matrix=mat, alpha=True)
        pix.save(output_path)
        print(f"Successfully converted {pdf_path} to {output_path}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

pdf_to_png(r'C:\Users\sanga\Downloads\thenn_nadu_premium_logo.pdf', r'public\logo.png')
