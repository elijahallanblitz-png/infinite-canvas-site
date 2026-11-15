"""Generates app icons, splash screens and the hero background. Run: python3 scripts/make-assets.py"""
from PIL import Image, ImageDraw, ImageFilter
import os, math
ROOT = os.path.join(os.path.dirname(__file__), '..')
PUB = os.path.join(ROOT, 'public')
BG = (6, 6, 6); CREAM = (232, 230, 225); GOLD = (212, 168, 67); TEAL = (79, 152, 163)

def mark(size, scale=0.62, bg=BG, flare=True):
    S = size * 4
    im = Image.new('RGB', (S, S), bg)
    cx = cy = S / 2
    r = S * scale / 2
    if flare:
        glow = Image.new('RGB', (S, S), (0, 0, 0))
        g = ImageDraw.Draw(glow)
        g.rectangle([0, cy - S * 0.006, S, cy + S * 0.006], fill=(40, 110, 120))
        g.ellipse([cx - r * 0.5, cy - r * 0.12, cx + r * 0.5, cy + r * 0.12], fill=(50, 130, 140))
        glow = glow.filter(ImageFilter.GaussianBlur(S * 0.03))
        im = Image.composite(im, im, Image.new('L', (S, S), 255))
        im = Image.blend(im, Image.eval(glow, lambda v: v), 0.0)
        from PIL import ImageChops
        im = ImageChops.add(im, glow)
    d = ImageDraw.Draw(im)
    w = max(2, int(S * 0.022))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CREAM, width=w)
    # teal ticks, like the site mark
    tw = max(2, int(S * 0.016))
    for ang, off in ((270, 0.09), (90, -0.09), (180, -0.09), (0, 0.09)):
        a = math.radians(ang)
        x0 = cx + math.cos(a) * r; y0 = cy + math.sin(a) * r
        x1 = cx + math.cos(a) * r * 0.77 + (off * r if ang in (270, 90) else 0)
        y1 = cy + math.sin(a) * r * 0.77 + (off * r if ang in (0, 180) else 0)
        d.line([x0, y0, x1, y1], fill=TEAL, width=tw)
    gr = r * 0.13
    d.ellipse([cx - gr, cy - gr, cx + gr, cy + gr], fill=GOLD)
    return im.resize((size, size), Image.LANCZOS)

mark(192).save(os.path.join(PUB, 'icons/icon-192.png'), optimize=True)
mark(512).save(os.path.join(PUB, 'icons/icon-512.png'), optimize=True)
mark(512, scale=0.46).save(os.path.join(PUB, 'icons/icon-maskable-512.png'), optimize=True)
mark(180, scale=0.58).save(os.path.join(PUB, 'icons/apple-touch-icon.png'), optimize=True)
mark(32, scale=0.8, flare=False).save(os.path.join(PUB, 'icons/favicon-32.png'), optimize=True)

# monochrome badge (Android status bar): white ring on transparent
S = 96 * 4
b = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(b)
d.ellipse([S * .14, S * .14, S * .86, S * .86], outline=(255, 255, 255, 255), width=int(S * .07))
d.ellipse([S * .42, S * .42, S * .58, S * .58], fill=(255, 255, 255, 255))
b.resize((96, 96), Image.LANCZOS).save(os.path.join(PUB, 'icons/badge-96.png'), optimize=True)

# iOS splash screens: black with the mark, so launch never flashes white
SPLASH = [(750, 1334, 2), (828, 1792, 2), (1125, 2436, 3), (1170, 2532, 3), (1179, 2556, 3), (1206, 2622, 3),
          (1284, 2778, 3), (1290, 2796, 3), (1320, 2868, 3)]
links = []
for w, h, dpr in SPLASH:
    im = Image.new('RGB', (w, h), BG)
    m = mark(int(w * 0.3), scale=0.7)
    im.paste(m, ((w - m.width) // 2, (h - m.height) // 2))
    name = f'splash/splash-{w}x{h}.png'
    im.save(os.path.join(PUB, name), optimize=True)
    links.append(f'<link rel="apple-touch-startup-image" href="/{name}" media="(device-width: {w // dpr}px) and (device-height: {h // dpr}px) and (-webkit-device-pixel-ratio: {dpr}) and (orientation: portrait)">')
open(os.path.join(ROOT, 'scripts/splash-links.html'), 'w').write('\n'.join(links) + '\n')

# hero background (from infinitecanvas.space/assets/hero.png), compressed for cellular
hero = Image.open(os.path.join(ROOT, '..', 'assets', 'hero.png')).convert('RGB')
hero.resize((1280, int(1280 * hero.height / hero.width)), Image.LANCZOS).save(os.path.join(PUB, 'hero.webp'), quality=86, method=6)
print('ok')
