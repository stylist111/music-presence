"""Draws extension/icons/icon{16,32,48,128}.png and src/icon.ico: a white note on an orange tile."""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'extension', 'icons')
S = 512  # draw big, then downscale


def draw():
    img = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(img)
    # vertical gradient tile
    grad = Image.new('RGBA', (1, S))
    for y in range(S):
        t = y / (S - 1)
        grad.putpixel((0, y), (int(255 - 25 * t), int(122 - 62 * t), int(40 + 20 * t), 255))
    mask = Image.new('L', (S, S))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=S // 5, fill=255)
    img.paste(grad.resize((S, S)), (0, 0), mask)
    # note: two heads joined by a beam
    w = (255, 255, 255, 255)
    for cx in (175, 345):
        d.ellipse((cx - 62, 330, cx + 52, 420), fill=w)
    d.rectangle((215, 120, 247, 380), fill=w)
    d.rectangle((385, 90, 417, 350), fill=w)
    d.polygon([(215, 120), (417, 90), (417, 160), (215, 190)], fill=w)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    img = draw()
    for n in (16, 32, 48, 128):
        img.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, f'icon{n}.png'))
    img.save(os.path.join(HERE, 'icon.ico'), sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])


if __name__ == '__main__':
    main()
