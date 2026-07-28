from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parent.parent / "build"
out.mkdir(parents=True, exist_ok=True)

def draw_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    pad = round(size * 0.075)
    radius = round(size * 0.24)
    draw.rounded_rectangle((pad, pad, size - pad, size - pad), radius=radius, fill="#D6FF74")
    center = size / 2
    gap = size * 0.07
    bar_width = max(2, round(size * 0.055))
    heights = (size * 0.25, size * 0.47, size * 0.31)
    for index, height in enumerate(heights):
        x = center + (index - 1) * gap
        draw.rounded_rectangle(
            (round(x - bar_width / 2), round(center - height / 2), round(x + bar_width / 2), round(center + height / 2)),
            radius=max(1, bar_width // 2),
            fill="#20202A",
        )
    return image

base = draw_icon(512)
base.save(out / "icon.png", optimize=True)
base.save(out / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
