from PIL import Image, ImageDraw, ImageFilter

D = 1600
R = int(D * 0.125)  # corner radius of the plate
cx, cy = int(D * 0.38), int(D * 0.34)

# soft light base, brightest toward top-left (same recipe as the disc)
small = Image.new('L', (200, 200))
px = small.load()
for y in range(200):
    for x in range(200):
        d = (((x / 2 - cx / 2) ** 2) + ((y / 2 - cy / 2) ** 2)) ** 0.5 / (D * 0.42)
        v = 255 - int(20 * min(d, 1.5))
        px[x, y] = max(230, v)
base = small.resize((D, D), Image.BICUBIC).convert('RGB')

# broad top glass highlight
hl = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(hl)
d.rounded_rectangle((int(D * 0.05), int(D * 0.0), int(D * 0.72), int(D * 0.52)), radius=R, fill=120)
hl = hl.filter(ImageFilter.GaussianBlur(65))
white = Image.new('RGB', (D, D), (255, 255, 255))
base = Image.composite(white, base, hl)

# small hot spot, top-left
hot = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(hot)
d.ellipse((D * 0.16, D * 0.08, D * 0.34, D * 0.24), fill=200)
hot = hot.filter(ImageFilter.GaussianBlur(18))
base = Image.composite(white, base, hot)

# soft depth shading, bottom-right
sh = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(sh)
d.rounded_rectangle((int(D * 0.2), int(D * 0.62), D, D), radius=R, fill=52)
sh = sh.filter(ImageFilter.GaussianBlur(90))
black = Image.new('RGB', (D, D), (106, 106, 142))
base = Image.composite(black, base, sh)

# rim light just inside the plate edge
rim = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(rim)
d.rounded_rectangle((14, 14, D - 14, D - 14), radius=R, outline=255, width=30)
rim = rim.filter(ImageFilter.GaussianBlur(10))
base = Image.composite(white, base, rim.point(lambda v: int(v * 0.4)))

# diagonal light sheen
sheen = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(sheen)
d.polygon([(D * 0.05, D * 0.44), (D * 0.52, D * 0.0), (D * 0.74, D * 0.0), (D * 0.16, D * 0.48)], fill=80)
sheen = sheen.filter(ImageFilter.GaussianBlur(26))
base = Image.composite(white, base, sheen)

# rounded-rectangle mask — corners physically transparent
mask = Image.new('L', (D, D), 0)
d = ImageDraw.Draw(mask)
d.rounded_rectangle((6, 6, D - 6, D - 6), radius=R, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(3))

plate = base.convert('RGBA')
plate.putalpha(mask)

# TMN artwork with baked chrome shine (identical to the disc)
logo = Image.open('/app/frontend/public/logo-circle.png').convert('RGBA')
side = int(D * 0.84)
ratio = min(side / logo.width, side / logo.height)
logo = logo.resize((int(logo.width * ratio), int(logo.height * ratio)), Image.LANCZOS)

chrome = Image.new('L', logo.size, 0)
d = ImageDraw.Draw(chrome)
w, h = logo.size
d.polygon([(int(w*0.02), h), (int(w*0.46), 0), (int(w*0.60), 0), (int(w*0.16), h)], fill=110)
d.polygon([(int(w*0.55), h), (int(w*0.72), 0), (int(w*0.78), 0), (int(w*0.61), h)], fill=60)
chrome = chrome.filter(ImageFilter.GaussianBlur(14))
logo_white = Image.new('RGB', logo.size, (255, 255, 255))
lg = Image.composite(logo_white, logo.convert('RGB'), chrome).convert('RGBA')
lg.putalpha(logo.split()[3])
logo = lg

plate.paste(logo, ((D - logo.width) // 2, (D - logo.height) // 2), logo)
plate.save('/app/frontend/public/logo-plate.png')

out = Image.open('/app/frontend/public/logo-plate.png')
corners = [out.getpixel(p)[3] for p in [(3, 3), (D - 4, 3), (3, D - 4), (D - 4, D - 4)]]
print('corner alphas:', corners, '| saved', out.size)
