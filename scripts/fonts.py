#!/usr/bin/env python3
"""Generates Molbhav's static font subsets and the SVG wordmark (DECISIONS D3, docs/DESIGN.md §4 and §6).

Run inside the project venv:  .venv/bin/python scripts/fonts.py
It downloads the official sources from the google/fonts repo (cached in scripts/.font-cache/, gitignored),
then writes, all committed:
  app/fonts/*.woff2            static subsets loaded with next/font/local
  assets/og/*.ttf              static TTFs for share images (@vercel/og, Phase 6B)
  components/mb/wordmarkPaths.ts   the wordmark as SVG path data (no live text)
and prints every file's size.
"""
from __future__ import annotations

import io
import sys
import urllib.request
from pathlib import Path

import uharfbuzz as hb
from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "scripts" / ".font-cache"
FONTS_OUT = ROOT / "app" / "fonts"
OG_OUT = ROOT / "assets" / "og"
WORDMARK_OUT = ROOT / "components" / "mb" / "wordmarkPaths.ts"

BASE = "https://github.com/google/fonts/raw/main/ofl"
SOURCES = {
    "anek-devanagari-var.ttf": f"{BASE}/anekdevanagari/AnekDevanagari%5Bwdth,wght%5D.ttf",
    "anek-latin-var.ttf": f"{BASE}/aneklatin/AnekLatin%5Bwdth,wght%5D.ttf",
    "mukta-400.ttf": f"{BASE}/mukta/Mukta-Regular.ttf",
    "mukta-600.ttf": f"{BASE}/mukta/Mukta-SemiBold.ttf",
    "plexmono-500.ttf": f"{BASE}/ibmplexmono/IBMPlexMono-Medium.ttf",
    "plexmono-600.ttf": f"{BASE}/ibmplexmono/IBMPlexMono-SemiBold.ttf",
}

# DESIGN.md §6 (with R13's additions): Devanagari, Basic Latin, NBSP, · ×, ZWNJ/ZWJ, – —, quotes, …, arrows, −, ₹, ◌
UI_RANGES = [
    (0x0900, 0x097F), (0x0020, 0x007E), (0x00A0, 0x00A0), (0x00B7, 0x00B7), (0x00D7, 0x00D7),
    (0x200C, 0x200D), (0x2013, 0x2014), (0x2018, 0x201D), (0x2026, 0x2026), (0x2190, 0x2193),
    (0x2212, 0x2212), (0x20B9, 0x20B9), (0x25CC, 0x25CC),
]
LATIN_RANGES = [(0x0020, 0x007E), (0x00A0, 0x00A0), (0x00B7, 0x00B7), (0x00D7, 0x00D7), (0x2013, 0x2014),
                (0x2018, 0x201D), (0x2026, 0x2026), (0x2212, 0x2212), (0x20B9, 0x20B9)]
DIGIT_CHARS = "0123456789₹,."

# OpenType features to keep: every Devanagari shaping feature (conjuncts, reph, half forms, matras,
# marks) plus kerning and basic ligatures. Latin extras (small caps, fractions, stylistic sets…) are
# dropped to stay inside the font budget.
UI_FEATURES = [
    "ccmp", "locl", "nukt", "akhn", "rphf", "rkrf", "pref", "blwf", "abvf", "half", "pstf", "vatu", "cjct",
    "init", "pres", "abvs", "blws", "psts", "haln", "dist", "abvm", "blwm", "kern", "mark", "mkmk",
    "liga", "clig", "calt", "rlig", "rclt",
]


def unicodes(ranges: list[tuple[int, int]]) -> list[int]:
    return [cp for lo, hi in ranges for cp in range(lo, hi + 1)]


def fetch(name: str) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print(f"downloading {name} …", file=sys.stderr)
        with urllib.request.urlopen(SOURCES[name], timeout=60) as r:  # noqa: S310 (fixed https URLs)
            path.write_bytes(r.read())
    return path


def instance(src: Path, axes: dict[str, float]) -> TTFont:
    return instancer.instantiateVariableFont(TTFont(src), axes, updateFontNames=False)


def subset_font(font: TTFont, cps: list[int], features: list[str] | str, flavor: str | None) -> TTFont:
    opts = subset.Options()
    opts.layout_features = features if isinstance(features, list) else [features]
    opts.hinting = False
    opts.desubroutinize = True
    opts.notdef_outline = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    opts.flavor = flavor
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    font.flavor = flavor
    return font


def save(font: TTFont, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    font.save(buf)
    data = buf.getvalue()
    path.write_bytes(data)
    return len(data)


def missing(font_path: Path, chars: str) -> str:
    cmap = TTFont(font_path).getBestCmap()
    return "".join(ch for ch in chars if ord(ch) not in cmap)


def wordmark_paths(font: TTFont, text: str, features: dict[str, bool] | None = None) -> dict[str, object]:
    """Shapes `text` with HarfBuzz (so matras and conjuncts are right) and draws it as one SVG path, y down."""
    buf = io.BytesIO()
    font.save(buf)
    face = hb.Face(buf.getvalue())
    hb_font = hb.Font(face)
    hb_buf = hb.Buffer()
    hb_buf.add_str(text)
    hb_buf.guess_segment_properties()
    hb.shape(hb_font, hb_buf, features or {"kern": True, "liga": True})
    glyph_set = font.getGlyphSet()
    upm = font["head"].unitsPerEm
    pen = SVGPathPen(glyph_set)
    bounds = BoundsPen(glyph_set)
    x = 0
    for info, pos in zip(hb_buf.glyph_infos, hb_buf.glyph_positions):
        name = font.getGlyphName(info.codepoint)
        transform = (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)  # flip to SVG's y-down; baseline at y = 0
        glyph_set[name].draw(TransformPen(pen, transform))
        glyph_set[name].draw(TransformPen(bounds, transform))
        x += pos.x_advance
    x_min, y_min, x_max, y_max = bounds.bounds
    return {
        "d": pen.getCommands(),
        "viewBox": [round(x_min), round(y_min), round(x_max - x_min), round(y_max - y_min)],
        "unitsPerEm": upm,
        "advance": x,
    }


def main() -> None:
    sizes: list[tuple[str, int]] = []
    ui = unicodes(UI_RANGES)
    latin = unicodes(LATIN_RANGES)
    digits = [ord(c) for c in DIGIT_CHARS]

    anek_dev = fetch("anek-devanagari-var.ttf")
    anek_lat = fetch("anek-latin-var.ttf")

    # Anek 700 at normal width, Devanagari + Latin (titles, dealer names).
    font = subset_font(instance(anek_dev, {"wght": 700, "wdth": 100}), ui, UI_FEATURES, "woff2")
    sizes.append(("app/fonts/anek-700.woff2", save(font, FONTS_OUT / "anek-700.woff2")))

    # Anek 800 digits only, with tabular figures, at widths 125 / 112 / 100 (D3, D4's width steps).
    # Google's Devanagari file has no tnum, so these come from Anek Latin.
    for width in (125, 112, 100):
        font = subset_font(instance(anek_lat, {"wght": 800, "wdth": width}), digits, ["tnum", "kern"], "woff2")
        sizes.append((f"app/fonts/anek-digits-800-w{width}.woff2", save(font, FONTS_OUT / f"anek-digits-800-w{width}.woff2")))

    # Mukta 400 and 600 (UI and body).
    for weight in (400, 600):
        font = subset_font(TTFont(fetch(f"mukta-{weight}.ttf")), ui, UI_FEATURES, "woff2")
        sizes.append((f"app/fonts/mukta-{weight}.woff2", save(font, FONTS_OUT / f"mukta-{weight}.woff2")))

    # IBM Plex Mono 500 and 600, Latin + ₹ (ledger numerals).
    for weight in (500, 600):
        font = subset_font(TTFont(fetch(f"plexmono-{weight}.ttf")), latin, ["tnum", "kern", "zero"], "woff2")
        sizes.append((f"app/fonts/plexmono-{weight}.woff2", save(font, FONTS_OUT / f"plexmono-{weight}.woff2")))

    # Static TTFs for share images (Satori needs TTF/OTF, not woff2).
    og = [
        ("anek-700.ttf", instance(anek_dev, {"wght": 700, "wdth": 100}), ui),
        ("anek-800-w125.ttf", instance(anek_dev, {"wght": 800, "wdth": 125}), ui),
        ("mukta-400.ttf", TTFont(fetch("mukta-400.ttf")), ui),
        ("mukta-600.ttf", TTFont(fetch("mukta-600.ttf")), ui),
    ]
    for name, f, cps in og:
        sizes.append((f"assets/og/{name}", save(subset_font(f, cps, UI_FEATURES, None), OG_OUT / name)))

    # The wordmark: Anek Devanagari Expanded ExtraBold (width 125, weight 800), drawn as SVG (DESIGN §4).
    dev = wordmark_paths(instance(anek_dev, {"wght": 800, "wdth": 125}), "मोलभाव")
    lat = wordmark_paths(instance(anek_lat, {"wght": 700, "wdth": 125}), "MOLBHAV")
    WORDMARK_OUT.write_text(
        "// Generated by scripts/fonts.py from Anek (OFL). Do not edit by hand.\n"
        "// The wordmark as SVG path data, y down, baseline at y = 0, in font units.\n"
        f"export const WORDMARK_HI = {{ d: {dev['d']!r}, viewBox: {dev['viewBox']}, unitsPerEm: {dev['unitsPerEm']} }} as const;\n"
        f"export const WORDMARK_LATIN = {{ d: {lat['d']!r}, viewBox: {lat['viewBox']}, unitsPerEm: {lat['unitsPerEm']} }} as const;\n",
        encoding="utf-8",
    )
    sizes.append(("components/mb/wordmarkPaths.ts", WORDMARK_OUT.stat().st_size))

    gaps = {
        "anek-700 (UI chars)": missing(FONTS_OUT / "anek-700.woff2", "₹·×–—‘’“”…−"),
        "mukta-400 (UI chars)": missing(FONTS_OUT / "mukta-400.woff2", "₹·×–—‘’“”…−"),
        "plexmono-500 (₹)": missing(FONTS_OUT / "plexmono-500.woff2", "₹"),
        "digits w125": missing(FONTS_OUT / "anek-digits-800-w125.woff2", DIGIT_CHARS),
    }

    print("\nGenerated files:")
    for name, n in sizes:
        print(f"  {n / 1024:7.1f} KB  {name}")
    web = sum(n for name, n in sizes if name.endswith(".woff2"))
    print(f"  {web / 1024:7.1f} KB  total of all woff2 subsets (the first-render budget is measured in the browser)")
    for label, chars in gaps.items():
        if chars:
            print(f"  note: {label} has no glyph for {chars!r}; the browser falls back for those")


if __name__ == "__main__":
    main()
