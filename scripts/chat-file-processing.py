"""Bounded native extraction; stdin is a checksum-verified original, never instructions."""
import sys, json, io, base64, resource
resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
if sys.platform != 'darwin':
    resource.setrlimit(resource.RLIMIT_AS, (1536*1024*1024, 1536*1024*1024))
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 24_000_000
mime, requested = sys.argv[1], json.loads(sys.argv[2])
data = sys.stdin.buffer.read(200*1024*1024+1)
if not data or len(data)>200*1024*1024: raise ValueError('Original bound')
def picture(image, page):
    image=ImageOps.exif_transpose(image).convert('RGB')
    image.thumbnail((1568,1568))
    out=io.BytesIO();image.save(out,format='JPEG',quality=85)
    if out.tell()>1024*1024: raise ValueError('Image bound')
    return {'mimeType':'image/jpeg','data':base64.b64encode(out.getvalue()).decode(),'page':page}
if mime=='application/pdf':
    import fitz
    doc=fitz.open(stream=data,filetype='pdf')
    if doc.needs_pass or not 0<doc.page_count<=600:raise ValueError('Document unavailable')
    pages=requested or list(range(1,min(4,doc.page_count)+1))
    if len(set(pages))!=len(pages) or any(p<1 or p>doc.page_count for p in pages):raise ValueError('Page unavailable')
    media=[];texts=[]
    for p in pages:
        page=doc[p-1];scale=min(2,1568/max(page.rect.width,page.rect.height))
        pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False,colorspace=fitz.csRGB)
        media.append(picture(Image.frombytes('RGB',(pix.width,pix.height),pix.samples),p))
        texts.append('Page '+str(p)+': '+page.get_text()[:12000])
    result={'pageCount':doc.page_count,'pages':pages,'text':'\n'.join(texts)[:16000],'media':media,'partial':len(pages)<doc.page_count}
elif mime in ['image/png','image/jpeg','image/webp']:
    image=Image.open(io.BytesIO(data));image.load()
    result={'pageCount':1,'pages':[1],'text':'','media':[picture(image,1)],'partial':False}
else:raise ValueError('Unsupported format')
print(json.dumps(result))
