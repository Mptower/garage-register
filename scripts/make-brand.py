"""Generates the add-on store artwork: addon/icon.png and addon/logo.png.

Run manually when the branding changes; the output is committed.

    python scripts/make-brand.py

Both images are a vintage instrument gauge — chrome bezel, parchment dial, red
needle — because that reads as "car" at the 48px the sidebar actually renders
the icon at, where anything with more detail turns to mush.

Everything is drawn from height fields and angle functions rather than flat
fills, for the same reason the UI textures are: a flat circle of grey does not
look like chrome, it looks like a flat circle of grey.
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ADDON = os.path.join(os.path.dirname(HERE), "addon")

# Sampled from the project's own palette: the Wisconsin collector plate supplies
# the red, the dashboard supplies the oxblood and parchment.
OXBLOOD_LIGHT = np.array([96, 27, 42], float)
OXBLOOD_DARK = np.array([34, 10, 17], float)
PARCHMENT = np.array([232, 220, 192], float)
PLATE_RED = (168, 57, 42)
INK = (58, 42, 28)

SS = 4  # supersample factor; everything is drawn big and shrunk down


def _font(size, candidates=("impact.ttf", "arialbd.ttf", "georgiab.ttf")):
    for name in candidates:
        path = os.path.join("C:\\Windows\\Fonts", name)
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def _rounded_mask(size, radius, supersample=1):
    """Antialiased rounded-rectangle mask."""
    w, h = size
    mask = Image.new("L", (w * supersample, h * supersample), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, w * supersample - 1, h * supersample - 1),
        radius=radius * supersample,
        fill=255,
    )
    if supersample > 1:
        mask = mask.resize((w, h), Image.LANCZOS)
    return mask


def gauge(size):
    """The gauge face, as an RGBA image with a transparent surround."""
    s = size * SS
    yy, xx = np.mgrid[0:s, 0:s].astype(float)
    cx = cy = (s - 1) / 2.0
    dx, dy = xx - cx, yy - cy
    r = np.hypot(dx, dy) / (s / 2.0)          # 0 at centre, 1 at the edge
    ang = np.arctan2(dy, dx)

    rgb = np.zeros((s, s, 3), float)
    alpha = np.zeros((s, s), float)

    # --- chrome bezel -----------------------------------------------------
    # Two opposed highlights, which is what makes a ring read as polished metal
    # rather than painted: light picks up where the surface turns toward it.
    bezel = (r <= 1.0) & (r > 0.76)
    sheen = 0.5 + 0.5 * np.cos(2.0 * (ang - math.radians(-55)))
    sheen = sheen**2.0
    # Shade across the ring's width too, so it looks round in section.
    across = np.clip((r - 0.76) / 0.24, 0, 1)
    section = np.sin(across * math.pi) ** 0.7
    # A wide range matters more than the midpoint: chrome is mostly very light
    # or very dark, with little in between. A narrow range reads as plastic.
    chrome = 26 + 222 * sheen * (0.38 + 0.62 * section)
    # Darken the extreme outer edge so the disc has a defined silhouette
    # against a light background as well as a dark one.
    chrome *= 1.0 - 0.55 * np.clip((r - 0.955) / 0.045, 0, 1)
    # Fine circumferential brushing.
    rng = np.random.default_rng(1949)
    chrome += rng.normal(0, 4, (s, s)) * section
    chrome = np.clip(chrome, 0, 255)
    for c in range(3):
        rgb[..., c] = np.where(bezel, chrome * (1.0, 1.0, 1.02)[c], rgb[..., c])
    alpha[bezel] = 255

    # --- dial face --------------------------------------------------------
    face = r <= 0.78
    # Vignette: old gauge faces are darker at the rim, from the bezel shadow.
    vig = 1.0 - 0.30 * np.clip((r / 0.78) ** 2.4, 0, 1)
    paper = rng.normal(0, 3.0, (s, s))
    for c in range(3):
        rgb[..., c] = np.where(face, PARCHMENT[c] * vig + paper, rgb[..., c])
    alpha[face] = 255

    # Inner shadow where the dial meets the bezel, so the face sits *under* it.
    lip = (r > 0.70) & (r <= 0.78)
    depth = np.clip((r - 0.70) / 0.08, 0, 1) ** 1.5
    for c in range(3):
        rgb[..., c] = np.where(lip, rgb[..., c] * (1 - 0.45 * depth), rgb[..., c])

    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")
    img.putalpha(Image.fromarray(np.clip(alpha, 0, 255).astype(np.uint8), "L"))

    # --- ticks and needle -------------------------------------------------
    d = ImageDraw.Draw(img)
    start, sweep = math.radians(150), math.radians(240)
    for i in range(25):
        t = i / 24.0
        a = start + sweep * t
        major = i % 4 == 0
        r0 = 0.52 if major else 0.60
        r1 = 0.67
        w = int(s * (0.018 if major else 0.009))
        d.line(
            [
                (cx + math.cos(a) * r0 * s / 2, cy + math.sin(a) * r0 * s / 2),
                (cx + math.cos(a) * r1 * s / 2, cy + math.sin(a) * r1 * s / 2),
            ],
            fill=INK + (255,),
            width=w,
        )

    # Needle parked where a working gauge sits, not at either stop.
    a = start + sweep * 0.62
    tip = (cx + math.cos(a) * 0.60 * s / 2, cy + math.sin(a) * 0.60 * s / 2)
    tail = (cx - math.cos(a) * 0.14 * s / 2, cy - math.sin(a) * 0.14 * s / 2)
    shadow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).line(
        [(tail[0] + s * 0.012, tail[1] + s * 0.016), (tip[0] + s * 0.012, tip[1] + s * 0.016)],
        fill=(0, 0, 0, 110),
        width=int(s * 0.030),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(s * 0.010))
    img.alpha_composite(shadow)
    d = ImageDraw.Draw(img)
    d.line([tail, tip], fill=PLATE_RED + (255,), width=int(s * 0.028))

    # Chrome pivot cap.
    pr = s * 0.055
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=(196, 198, 202, 255))
    d.ellipse(
        [cx - pr * 0.55, cy - pr * 0.55, cx + pr * 0.55, cy + pr * 0.55],
        fill=(132, 136, 142, 255),
    )

    return img.resize((size, size), Image.LANCZOS)


def oxblood_panel(size):
    """Deep oxblood ground with a soft centre light and a little grain."""
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(float)
    nx = (xx - w / 2) / (w / 2)
    ny = (yy - h / 2) / (h / 2)
    fall = np.clip(1.0 - 0.55 * np.hypot(nx * 0.8, ny), 0, 1) ** 1.3
    rng = np.random.default_rng(7)
    grain = rng.normal(0, 3.0, (h, w))
    rgb = np.zeros((h, w, 3), float)
    for c in range(3):
        rgb[..., c] = OXBLOOD_DARK[c] + (OXBLOOD_LIGHT[c] - OXBLOOD_DARK[c]) * fall + grain
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def make_icon(size=256):
    img = oxblood_panel((size, size)).convert("RGBA")
    g = gauge(int(size * 0.80))
    off = (size - g.width) // 2
    img.alpha_composite(g, (off, off))
    img.putalpha(_rounded_mask((size, size), radius=int(size * 0.20), supersample=4))
    return img


def make_logo(size=(500, 200)):
    w, h = size
    img = oxblood_panel(size).convert("RGBA")

    # Chrome rules top and bottom, like the edge of an instrument panel.
    d = ImageDraw.Draw(img)
    for y, shade in ((3, 190), (4, 120), (h - 5, 120), (h - 4, 190)):
        d.line([(0, y), (w, y)], fill=(shade, shade, shade + 4, 255), width=1)

    g = gauge(int(h * 0.74))
    img.alpha_composite(g, (int(h * 0.16), (h - g.height) // 2))

    x = int(h * 0.16) + g.width + int(w * 0.055)
    small = _font(int(h * 0.125))
    big = _font(int(h * 0.255))

    def emboss(xy, text, font, fill):
        px, py = xy
        d.text((px, py + 2), text, font=font, fill=(0, 0, 0, 150))
        d.text((px, py - 1), text, font=font, fill=(255, 230, 210, 40))
        d.text((px, py), text, font=font, fill=fill)

    emboss((x, int(h * 0.255)), "THE", small, (198, 170, 150, 255))
    emboss((x, int(h * 0.375)), "GARAGE", big, (238, 228, 204, 255))
    emboss((x, int(h * 0.625)), "REGISTER", big, (238, 228, 204, 255))

    img.putalpha(_rounded_mask(size, radius=int(h * 0.06), supersample=4))
    return img


if __name__ == "__main__":
    os.makedirs(ADDON, exist_ok=True)
    icon_path = os.path.join(ADDON, "icon.png")
    logo_path = os.path.join(ADDON, "logo.png")
    make_icon().save(icon_path)
    make_logo().save(logo_path)
    for p in (icon_path, logo_path):
        print(f"  {os.path.relpath(p, os.path.dirname(HERE))}  "
              f"{Image.open(p).size}  {os.path.getsize(p) / 1024:.1f} kB")
