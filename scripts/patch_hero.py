import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

# Load original hero image
img = Image.open('hero-geraicuan-v2.jpg').convert('RGBA')
arr = np.array(img)

# Brand colors
NAVY = (11, 45, 79, 255)         # #0B2D4F
GREEN = (16, 185, 129, 255)      # #10B981
WHITE = (255, 255, 255, 255)
LIGHT_GRAY = (203, 213, 225, 255)

font_bold_path = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

font_title = ImageFont.truetype(font_bold_path, 15)
font_card = ImageFont.truetype(font_bold_path, 16)
font_btn = ImageFont.truetype(font_bold_path, 11)
font_box = ImageFont.truetype(font_bold_path, 34)
font_printer = ImageFont.truetype(font_bold_path, 13)
font_label = ImageFont.truetype(font_bold_path, 13)

# ----------------------------------------------------
# 1. SCREEN UPDATES (Monitor Screen at X: 244..776, Y: 167..486)
# ----------------------------------------------------
# Top Bar: Y 167..203, X 244..776
for y in range(167, 204):
    for x in range(244, 777):
        r, g, b, a = arr[y, x]
        if x < 450: # left side with old title
            arr[y, x] = NAVY
        else: # right side: recolor blue bg, preserve white icons
            if b > 100 and r < 75 and g < 110:
                arr[y, x] = NAVY

# Kirim Barang Card Header: X 421..770, Y 210..247
for y in range(210, 248):
    for x in range(421, 771):
        r, g, b, a = arr[y, x]
        if b > 100 and r < 75:
            arr[y, x] = NAVY

# Left Action Button: X 259..392, Y 449..475
for y in range(449, 476):
    for x in range(259, 393):
        r, g, b, a = arr[y, x]
        if b > 100 and r < 75:
            arr[y, x] = GREEN

# Active item left vertical stripe: X 250..253, Y 241..271
for y in range(241, 272):
    for x in range(250, 254):
        arr[y, x] = GREEN

img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)

# Screen Top Bar Content:
mark_white = Image.open('logos/rendered-mark-white-512.png').convert('RGBA')
mark_top = mark_white.resize((24, 24), Image.Resampling.LANCZOS)
img.paste(mark_top, (256, 173), mark_top)

draw.text((286, 176), "Gerai", font=font_title, fill=WHITE)
bbox_gerai = draw.textbbox((286, 176), "Gerai", font=font_title)
w_gerai = bbox_gerai[2] - bbox_gerai[0]

draw.text((286 + w_gerai, 176), "Cuan", font=font_title, fill=GREEN)
bbox_cuan = draw.textbbox((286 + w_gerai, 176), "Cuan", font=font_title)
w_cuan = bbox_cuan[2] - bbox_cuan[0]

draw.text((286 + w_gerai + w_cuan + 7, 176), "POS", font=font_title, fill=LIGHT_GRAY)

# Screen Card Header: "Kirim Barang"
draw.text((435, 219), "Kirim Barang", font=font_card, fill=WHITE)

# Left Action Button text: "Bayar / Kirim"
draw.text((288, 455), "Bayar / Kirim", font=font_btn, fill=WHITE)


# ----------------------------------------------------
# 2. CARDBOARD BOX STAMP (X: 260..460, Y: 655..750)
# ----------------------------------------------------
box_arr = np.array(img)
top_sample = box_arr[640:655, 260:460, :3].astype(float)
bot_sample = box_arr[745:760, 260:460, :3].astype(float)

for y in range(655, 745):
    alpha = (y - 655) / (745 - 655)
    noise = np.random.normal(0, 1.2, (200, 3))
    row_tex = (1.0 - alpha) * top_sample[y % 15] + alpha * bot_sample[y % 15] + noise
    box_arr[y, 260:460, :3] = np.clip(row_tex, 0, 255).astype(np.uint8)

img = Image.fromarray(box_arr)

# Create a clean stamp image with G-mark + "GeraiCuan"
stamp_w, stamp_h = 240, 60
stamp_layer = Image.new('RGBA', (stamp_w, stamp_h), (0, 0, 0, 0))
stamp_draw = ImageDraw.Draw(stamp_layer)

mark_512 = Image.open('logos/rendered-mark-512.png').convert('RGBA')
mark_arr = np.array(mark_512)
mask_alpha = mark_arr[:, :, 3]
solid_brown = np.zeros_like(mark_arr)
solid_brown[:, :, 0] = 60
solid_brown[:, :, 1] = 38
solid_brown[:, :, 2] = 24
solid_brown[:, :, 3] = mask_alpha
stamp_mark = Image.fromarray(solid_brown).resize((46, 46), Image.Resampling.LANCZOS)
stamp_layer.paste(stamp_mark, (4, 7), stamp_mark)

stamp_draw.text((58, 10), "GeraiCuan", font=font_box, fill=(60, 38, 24, 240))
stamp_rotated = stamp_layer.rotate(-3.2, resample=Image.Resampling.BICUBIC, expand=True)

stamp_x = 262
stamp_y = 672
img.paste(stamp_rotated, (stamp_x, stamp_y), stamp_rotated)


# ----------------------------------------------------
# 3. THERMAL PRINTER CASING (X: 780..930, Y: 555..585)
# ----------------------------------------------------
p_arr = np.array(img)
plastic_sample = p_arr[556, 790:885, :3]
for y in range(560, 580):
    p_arr[y, 790:885, :3] = plastic_sample

for dy in range(-7, 8):
    for dx in range(-7, 8):
        dist = math.sqrt(dx*dx + dy*dy)
        if dist <= 6.5:
            px = 902 + dx
            py = 569 + dy
            glow = max(0.0, 1.0 - (dist / 6.5))
            r = int(16 * (1-glow) + 52 * glow)
            g = int(185 * (1-glow) + 211 * glow)
            b = int(129 * (1-glow) + 153 * glow)
            p_arr[py, px, :3] = [r, g, b]

img = Image.fromarray(p_arr)
draw = ImageDraw.Draw(img)

printer_mark = mark_white.resize((15, 15), Image.Resampling.LANCZOS)
img.paste(printer_mark, (800, 563), printer_mark)
draw.text((820, 562), "GeraiCuan", font=font_printer, fill=(225, 230, 235, 255))


# ----------------------------------------------------
# 4. THERMAL LABEL ON PRINTER (X: 800..925, Y: 593..615)
# ----------------------------------------------------
l_arr = np.array(img)
label_white = l_arr[590, 810:900, :3]
for y in range(593, 614):
    l_arr[y, 810:900, :3] = label_white

img = Image.fromarray(l_arr)
draw = ImageDraw.Draw(img)

draw.text((818, 594), "GeraiCuan", font=font_label, fill=(25, 25, 25, 255))

# Save updated image
output_path = 'hero-geraicuan-v2.jpg'
img.convert('RGB').save(output_path, quality=95, optimize=True)
print('Successfully saved updated hero-geraicuan-v2.jpg!')
