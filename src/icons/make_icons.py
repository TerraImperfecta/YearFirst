"""Draws the Year First icon.

Cascade: three squares nested off-centre, each settling toward the bottom
right — year contains month contains day, and the offset keeps it from
reading as a concentric camera lens.

Small sizes are not a mechanical downscale. At 32px and below the middle
square is dropped and the remaining strokes thicken, because hairlines
disappear at that scale.
"""
from PIL import Image, ImageDraw

S = 4              # supersample factor
SIMPLE_AT = 32     # this size and below: two levels, heavier strokes
BODY = "#B8730E"
MARK = "#FFFFFF"

#            x0   y0   x1   y1   radius  stroke (0 = filled)
FULL = [
    ((16, 16, 112, 112), 12, 8),
    ((46, 46, 98, 98), 9, 8),
    ((66, 66, 88, 88), 4, 0),
]
SIMPLE = [
    ((16, 16, 112, 112), 12, 14),
    ((64, 64, 96, 96), 6, 0),
]


def draw(size: int) -> Image.Image:
    n = size * S
    k = n / 128.0
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def rr(box, radius, width):
        x0, y0, x1, y1 = (v * k for v in box)
        if width:
            d.rounded_rectangle([x0, y0, x1, y1], radius=radius * k,
                                outline=MARK, width=max(1, round(width * k)))
        else:
            d.rounded_rectangle([x0, y0, x1, y1], radius=radius * k, fill=MARK)

    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=28 * k, fill=BODY)
    for box, radius, width in (SIMPLE if size <= SIMPLE_AT else FULL):
        rr(box, radius, width)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    import os
    os.makedirs("icons", exist_ok=True)
    for s in (16, 32, 48, 96, 128):
        draw(s).save(f"icons/icon-{s}.png")
        print(f"icons/icon-{s}.png")
