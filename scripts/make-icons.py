#!/usr/bin/env python3
"""
Generate ParkMatiq app icons (pin mark + swoosh on brand blue) at the sizes the
PWA needs. Drawn full-bleed with content in the centred safe zone so Android's
circle mask and iOS's rounded-square mask both crop cleanly.

  python scripts/make-icons.py            # writes a 1024 preview to scripts/
  python scripts/make-icons.py --write    # also writes the real public/ icons
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

BLUE   = (27, 69, 200)     # #1B45C8 brand blue
WHITE  = (255, 255, 255)
GOLD   = (255, 214, 0)     # #FFD600
SS     = 4                 # supersample factor for crisp edges
FONT   = "C:/Windows/Fonts/ariblk.ttf"   # Arial Black


def draw_icon(px):
    """Render the icon at px*px (supersampled internally)."""
    S = px * SS
    img = Image.new("RGBA", (S, S), BLUE + (255,))
    d = ImageDraw.Draw(img)
    cx = S / 2

    # --- location pin (white teardrop) -------------------------------------
    head_r = 0.205 * S
    head_cy = 0.40 * S
    tip_y = 0.70 * S
    d.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=WHITE)
    # point: triangle from the circle's lower flanks down to the tip
    flank = head_r * 0.74
    d.polygon([(cx - flank, head_cy + flank * 0.55),
               (cx + flank, head_cy + flank * 0.55),
               (cx, tip_y)], fill=WHITE)

    # inner blue disc + white "P"
    disc_r = head_r * 0.55
    d.ellipse([cx - disc_r, head_cy - disc_r, cx + disc_r, head_cy + disc_r], fill=BLUE)
    pfont = ImageFont.truetype(FONT, int(disc_r * 1.7))
    tb = d.textbbox((0, 0), "P", font=pfont)
    d.text((cx - (tb[2] - tb[0]) / 2 - tb[0],
            head_cy - (tb[3] - tb[1]) / 2 - tb[1]), "P", font=pfont, fill=WHITE)

    # --- gold swoosh (road) under the pin ----------------------------------
    sw_w = int(0.05 * S)
    box = [0.20 * S, 0.66 * S, 0.80 * S, 0.92 * S]
    d.arc(box, start=18, end=162, fill=GOLD, width=sw_w)

    return img.resize((px, px), Image.LANCZOS)


def main():
    write = "--write" in sys.argv
    here = os.path.dirname(__file__)
    pub = os.path.join(here, "..", "public")

    # high-res preview for review
    draw_icon(1024).save(os.path.join(here, "icon-preview-1024.png"))
    print("Wrote scripts/icon-preview-1024.png")

    if write:
        targets = {"icon-512.png": 512, "icon-192.png": 192, "apple-touch-icon.png": 180}
        for name, size in targets.items():
            draw_icon(size).save(os.path.join(pub, name))
            print("Wrote public/" + name)


if __name__ == "__main__":
    main()
