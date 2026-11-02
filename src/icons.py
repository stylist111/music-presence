"""Makes extension/icons/icon{16,32,48,128}.png and src/icon.ico from src/logo.png.

    python src/icons.py              resize the existing logo
    python src/icons.py NEW.png      clean up a new logo first (drop the faint glow and specks
                                     around the tile, crop, centre on a square) and save it as logo.png
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, 'logo.png')
OUT = os.path.join(HERE, '..', 'extension', 'icons')


def clean(path):
    img = Image.open(path).convert('RGBA')
    # Below half opacity is glow or noise, above ~95% is the tile itself.
    a = img.getchannel('A').point(lambda v: 0 if v < 128 else 255 if v > 240 else v)
    img.putalpha(a)
    img = img.crop(a.getbbox())
    side = max(img.size)
    square = Image.new('RGBA', (side, side))
    square.alpha_composite(img, ((side - img.width) // 2, (side - img.height) // 2))
    return square


def main():
    if len(sys.argv) > 1:
        clean(sys.argv[1]).save(LOGO)
    img = Image.open(LOGO)
    os.makedirs(OUT, exist_ok=True)
    for n in (16, 32, 48, 128):
        img.resize((n, n), Image.LANCZOS).save(os.path.join(OUT, f'icon{n}.png'))
    img.resize((256, 256), Image.LANCZOS).save(os.path.join(HERE, 'icon.ico'),
                                               sizes=[(16, 16), (32, 32), (48, 48), (256, 256)])


if __name__ == '__main__':
    main()
