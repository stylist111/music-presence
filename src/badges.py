"""Draws badges/*.png: site icons that fill Discord's round small-image slot edge to edge.
Discord cuts the small image into a circle; a site's own favicon with transparent corners
(YouTube's wide red rectangle) leaves dark gaps around it. Served from GitHub, see background.js.
"""
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'badges')
S = 1024  # draw big, then downscale


def rounded_triangle(d, pts, r, fill):
    # A polygon with round corners: filled core + thick round-capped edges.
    d.polygon(pts, fill=fill)
    for i in range(3):
        a, b = pts[i], pts[(i + 1) % 3]
        d.line([a, b], fill=fill, width=2 * r)
        d.ellipse((a[0] - r, a[1] - r, a[0] + r, a[1] + r), fill=fill)


def youtube():
    img = Image.new('RGBA', (S, S), '#ff0033')
    d = ImageDraw.Draw(img)
    w, h, r = 300, 350, 45   # triangle (before rounding), corner radius
    c = S / 2
    # Centred on its centroid, not its bounding box: looks centred in a circle.
    left, right = c - w / 3, c + 2 * w / 3
    rounded_triangle(d, [(left, c - h / 2), (right, c), (left, c + h / 2)], r, 'white')
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    youtube().resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'youtube.png'))


if __name__ == '__main__':
    main()
