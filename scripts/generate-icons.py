"""Generate BMF PWA icons from the source logo.

Produces three PNGs in ./public/:
  - icon-192.png       (192x192, logo mark centered on transparent bg)
  - icon-512.png       (512x512, same layout, higher res)
  - icon-maskable.png  (512x512, logo mark inside safe zone on black bg,
    so Android's aggressive masking doesn't clip the circle)

Source: public/BMF color logo_circle.png (full wordmark logo).
Only the top circle mark is used — wordmark text is unreadable at phone
icon sizes and would produce a muddy result.

Run: python scripts/generate-icons.py
"""
from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
SOURCE = PUBLIC / "BMF color logo_circle_BMF.png"

BLACK = (0, 0, 0, 255)
TRANSPARENT = (0, 0, 0, 0)


def extract_mark(src: Image.Image) -> Image.Image:
    """Return the logo cropped to its visible bounds (no transparent padding)."""
    src = src.convert("RGBA")
    bbox = src.getbbox()
    if bbox is None:
        return src
    return src.crop(bbox)


def fit_in_square(
    mark: Image.Image,
    size: int,
    padding_ratio: float,
    background: tuple[int, int, int, int],
) -> Image.Image:
    """Center `mark` in a size×size canvas with the given padding and bg."""
    canvas = Image.new("RGBA", (size, size), background)
    content_size = int(size * (1 - padding_ratio * 2))
    ratio = min(content_size / mark.width, content_size / mark.height)
    new_w = max(1, int(mark.width * ratio))
    new_h = max(1, int(mark.height * ratio))
    scaled = mark.resize((new_w, new_h), Image.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source logo not found at {SOURCE}")

    src = Image.open(SOURCE)
    mark = extract_mark(src)

    # Regular icons: transparent background, small padding so the mark breathes.
    fit_in_square(mark, 192, padding_ratio=0.08, background=TRANSPARENT).save(
        PUBLIC / "icon-192.png", "PNG"
    )
    fit_in_square(mark, 512, padding_ratio=0.08, background=TRANSPARENT).save(
        PUBLIC / "icon-512.png", "PNG"
    )
    # Maskable: black background (matches PWA theme), larger padding so the
    # mark sits inside the ~80% safe zone Android crops to.
    fit_in_square(mark, 512, padding_ratio=0.20, background=BLACK).save(
        PUBLIC / "icon-maskable.png", "PNG"
    )
    # Favicon: tiny browser-tab icon. Multi-size .ico covers older browsers,
    # plus a PNG fallback for modern ones.
    fit_in_square(mark, 32, padding_ratio=0.05, background=TRANSPARENT).save(
        PUBLIC / "favicon.png", "PNG"
    )
    fit_in_square(mark, 64, padding_ratio=0.05, background=TRANSPARENT).save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
    )
    print(f"Wrote icons to {PUBLIC} (from mark extracted from {SOURCE.name})")


if __name__ == "__main__":
    main()
