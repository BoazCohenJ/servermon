"""Renders ServerMon icons (run from repo root: python make_icon.py)."""
from PIL import Image, ImageDraw
import os
S = 1024
def draw_mark(d, color, dot, box, dotcolor_fn=None):
    x0, y0, x1, y1 = box
    h = (y1 - y0) / 3
    for i in range(3):
        top = y0 + i * h + h * 0.08
        bot = y0 + (i + 1) * h - h * 0.08
        d.rounded_rectangle([x0, top, x1, bot], radius=(bot - top) * 0.22, fill=color)
        cy = (top + bot) / 2
        r = (bot - top) * 0.13
        cx = x0 + (bot - top) * 0.34
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dot(i))
        # vent lines
        lx = x1 - (bot - top) * 0.32
        for k in range(3):
            xx = lx - k * (bot - top) * 0.14
            d.line([xx, cy - (bot - top) * 0.16, xx, cy + (bot - top) * 0.16], fill=dot(-1), width=int((bot - top) * 0.04))
os.makedirs("app/assets", exist_ok=True)
# main icon
bg = Image.new("RGB", (S, S))
px = bg.load()
for y in range(S):
    for x in range(S):
        t = (x + y) / (2 * S)
        px[x, y] = (int(47 + (20 - 47) * t), int(111 + (60 - 111) * t), int(237 + (160 - 237) * t))
d = ImageDraw.Draw(bg)
white = (255, 255, 255)
dots = [(74, 222, 128), (74, 222, 128), (251, 191, 36)]
dark = (30, 70, 170)
draw_mark(d, white, lambda i: dots[i] if i >= 0 else dark, (190, 250, 834, 774))
bg.save("app/assets/icon.png")
bg.resize((48, 48)).save("app/assets/favicon.png")
# adaptive foreground (safe zone ~66%)
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_mark(ImageDraw.Draw(fg), white, lambda i: dots[i] if i >= 0 else dark, (272, 302, 752, 722))
fg.save("app/assets/adaptive-icon.png")
# monochrome + notification (white shapes, transparent)
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw_mark(ImageDraw.Draw(mono), white, lambda i: (0, 0, 0, 0) if i >= 0 else (0, 0, 0, 0), (272, 302, 752, 722))
mono.save("app/assets/monochrome-icon.png")
mono.resize((96, 96), Image.LANCZOS).save("app/assets/notification-icon.png")
bg.resize((256, 256), Image.LANCZOS).save("assets/icon-256.png")
