import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

# Load original pristine image
img = Image.open('hero-geraicuan-v2.jpg').convert('RGBA')
arr = np.array(img)

# Official Brand Colors
NAVY = (11, 45, 79, 255)         # #0B2D4F
GREEN = (16, 185, 129, 255)      # #10B981
WHITE = (255, 255, 255, 255)
LIGHT_GRAY = (203, 213, 225, 255)
STAMP_BROWN = (62, 38, 22, 240)  # Cardboard ink

font_bold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font_title = ImageFont.truetype(font_bold, 15)
font_card = ImageFont.truetype(font_bold, 15)
font_btn = ImageFont.truetype(font_bold, 11)
font_box = ImageFont.truetype(font_bold, 30)
font_printer = ImageFont.truetype(font_bold, 11)
font_label = ImageFont.truetype(font_bold, 15)

# ====================================================
# 1. SCREEN UPDATES
# ====================================================
# Top Header Bar: X 244..776, Y 167..203
# Fill left side solid Navy to erase old title
for y in range(167, 204):
    for x in range(244, 450):
        arr[y, x] = NAVY
    # Right side: recolor blue background pixels, preserve white icons
    for x in range(450, 777):
        r, g, b, a = arr[y, x]
        if b > 100 and r < 75 and g < 110:
            arr[y, x] = NAVY

# Center Card Header ("Kirim Barang"): X 421..770, Y 210..247
# Solid Navy fill to completely cover old text
for y in range(210, 248):
    for x in range(421, 771):
        arr[y, x] = NAVY

# Left Action Button: X 259..392, Y 449..475
# Solid Brand Green fill to completely cover old text
for y in range(449, 476):
    for x in range(259, 393):
        arr[y, x] = GREEN

# Active sidebar vertical stripe: X 250..253, Y 241..271
for y in range(241, 272):
    for x in range(250, 254):
        arr[y, x] = GREEN

img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)

# Paste G-arrow mark on Top Bar
mark_white = Image.open('logos/rendered-mark-white-512.png').convert('RGBA')
mark_top = mark_white.resize((24, 24), Image.Resampling.LANCZOS)
img.paste(mark_top, (256, 173), mark_top)

# Draw Top Bar Text: "Gerai" (White), "Cuan" (Green), "POS" (Light Gray)
draw.text((286, 176), "Gerai", font=font_title, fill=WHITE)
bbox_g = draw.textbbox((286, 176), "Gerai", font=font_title)
w_g = bbox_g[2] - bbox_g[0]

draw.text((286 + w_g, 176), "Cuan", font=font_title, fill=GREEN)
bbox_c = draw.textbbox((286 + w_g, 176), "Cuan", font=font_title)
w_c = bbox_c[2] - bbox_c[0]

draw.text((286 + w_g + w_c + 7, 176), "POS", font=font_title, fill=LIGHT_GRAY)

# Draw Card Header Text: "Kirim Barang"
draw.text((435, 220), "Kirim Barang", font=font_card, fill=WHITE)

# Draw Button Text: "Bayar / Kirim" centered
draw.text((292, 456), "Bayar / Kirim", font=font_btn, fill=WHITE)


# ====================================================
# 2. CARDBOARD BOX STAMP (X: 265..430, Y: 660..745)
# ====================================================
box_arr = np.array(img)
# Inpaint old "[G] GeraiHub" by sampling clean cardboard texture
# Clean source strip on left: X 215..265 (width=50), Y 660..745
# We synthesize seamless cardboard patch
for y in range(660, 745):
    # Sample clean slice from left (X: 215..265)
    sample_left = box_arr[y, 220:265, :3].astype(float)
    # Replicate horizontally across X: 265..430
    needed_w = 430 - 265
    reps = int(np.ceil(needed_w / sample_left.shape[0]))
    tiled = np.tile(sample_left, (reps, 1))[:needed_w]
    # Add subtle cardboard grain noise
    noise = np.random.normal(0, 1.0, tiled.shape)
    box_arr[y, 265:430, :3] = np.clip(tiled + noise, 0, 255).astype(np.uint8)

img = Image.fromarray(box_arr)

# Create high-res stamp layer with G-mark + "GeraiCuan"
stamp_w, stamp_h = 220, 54
stamp_layer = Image.new('RGBA', (stamp_w, stamp_h), (0, 0, 0, 0))
stamp_draw = ImageDraw.Draw(stamp_layer)

# Mark recolored to dark cardboard ink
mark_512 = Image.open('logos/rendered-mark-512.png').convert('RGBA')
mark_arr = np.array(mark_512)
solid_ink = np.zeros_like(mark_arr)
solid_ink[:, :, 0] = STAMP_BROWN[0]
solid_ink[:, :, 1] = STAMP_BROWN[1]
solid_ink[:, :, 2] = STAMP_BROWN[2]
solid_ink[:, :, 3] = mark_arr[:, :, 3]
stamp_mark = Image.fromarray(solid_ink).resize((40, 40), Image.Resampling.LANCZOS)
stamp_layer.paste(stamp_mark, (4, 7), stamp_mark)

# Text "GeraiCuan"
stamp_draw.text((50, 11), "GeraiCuan", font=font_box, fill=STAMP_BROWN)

# Rotate stamp -3.0 degrees matching box perspective
stamp_rot = stamp_layer.rotate(-3.0, resample=Image.Resampling.BICUBIC, expand=True)

# Paste on box face
img.paste(stamp_rot, (270, 676), stamp_rot)


# ====================================================
# 3. THERMAL PRINTER CASING (X: 798..895, Y: 558..578)
# ====================================================
p_arr = np.array(img)
# Sample gray plastic from Y=554, X=800..895
plastic_row = p_arr[554, 800:895, :3]
for y in range(558, 578):
    p_arr[y, 800:895, :3] = plastic_row

# Status LED button at X=906, Y=567: change to glowing Emerald Green
for dy in range(-6, 7):
    for dx in range(-6, 7):
        dist = math.sqrt(dx*dx + dy*dy)
        if dist <= 5.5:
            px = 906 + dx
            py = 567 + dy
            glow = max(0.0, 1.0 - (dist / 5.5))
            r = int(16 * (1-glow) + 52 * glow)
            g = int(185 * (1-glow) + 211 * glow)
            b = int(129 * (1-glow) + 153 * glow)
            p_arr[py, px, :3] = [r, g, b]

img = Image.fromarray(p_arr)
draw = ImageDraw.Draw(img)

# Stamp G-arrow mark + "GeraiCuan" in metallic silver on printer
printer_mark = mark_white.resize((12, 12), Image.Resampling.LANCZOS)
img.paste(printer_mark, (803, 563), printer_mark)
draw.text((820, 562), "GeraiCuan", font=font_printer, fill=(225, 230, 235, 255))


# ====================================================
# 4. THERMAL PAPER LABEL (X: 810..915, Y: 637..659)
# ====================================================
l_arr = np.array(img)
# Fill with clean thermal label white
for y in range(637, 660):
    for x in range(810, 915):
        l_arr[y, x, :3] = [248, 248, 248]

img = Image.fromarray(l_arr)
draw = ImageDraw.Draw(img)

# Draw "GeraiCuan" on shipping label in bold black thermal print font
draw.text((818, 640), "GeraiCuan", font=font_label, fill=(25, 25, 25, 255))

# Save updated hero image
img.convert('RGB').save('hero-geraicuan-v2.jpg', quality=95, optimize=True)
print('Brand alignment complete! Saved hero-geraicuan-v2.jpg')
