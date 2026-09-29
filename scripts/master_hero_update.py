import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

# Load pristine source image
src_path = '/Users/feriromansyah/.gemini/antigravity-cli/brain/601df2a9-4311-428c-91bd-c11af4e8c341/geraihub_purewhite_pos_1790262460529.jpg'
img = Image.open(src_path).convert('RGBA')
arr = np.array(img)

# Official Brand Colors
NAVY = (11, 45, 79, 255)         # #0B2D4F
GREEN = (16, 185, 129, 255)      # #10B981
WHITE = (255, 255, 255, 255)
LIGHT_GRAY = (203, 213, 225, 255)
STAMP_BROWN = (60, 36, 20, 245)

font_bold = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
font_title = ImageFont.truetype(font_bold, 15)
font_card = ImageFont.truetype(font_bold, 15)
font_btn = ImageFont.truetype(font_bold, 11)
font_box = ImageFont.truetype(font_bold, 18)
font_printer = ImageFont.truetype(font_bold, 10)
font_label = ImageFont.truetype(font_bold, 14)

# ====================================================
# 1. MONITOR SCREEN
# ====================================================
# Top Header Bar: X 244..776, Y 167..203
for y in range(167, 204):
    for x in range(244, 450):
        arr[y, x] = NAVY
    for x in range(450, 777):
        r, g, b, a = arr[y, x]
        if b > 100 and r < 75 and g < 110:
            arr[y, x] = NAVY

# Card Header: X 421..770, Y 210..247 (Solid Navy)
for y in range(210, 248):
    for x in range(421, 771):
        arr[y, x] = NAVY

# Left Action Button: X 259..412, Y 449..475 (Full width, Solid Brand Green)
for y in range(449, 476):
    for x in range(259, 413):
        arr[y, x] = GREEN

# Sidebar vertical active bar: X 250..253, Y 241..271
for y in range(241, 272):
    for x in range(250, 254):
        arr[y, x] = GREEN

img = Image.fromarray(arr)
draw = ImageDraw.Draw(img)

# Paste G-arrow mark on Top Bar
mark_white = Image.open('logos/rendered-mark-white-512.png').convert('RGBA')
mark_top = mark_white.resize((24, 24), Image.Resampling.LANCZOS)
img.paste(mark_top, (256, 173), mark_top)

# Draw Top Bar Text: "Gerai" (White), "Cuan" (Brand Green), "POS" (Light Gray)
draw.text((286, 176), "Gerai", font=font_title, fill=WHITE)
bbox_g = draw.textbbox((286, 176), "Gerai", font=font_title)
w_g = bbox_g[2] - bbox_g[0]

draw.text((286 + w_g, 176), "Cuan", font=font_title, fill=GREEN)
bbox_c = draw.textbbox((286 + w_g, 176), "Cuan", font=font_title)
w_c = bbox_c[2] - bbox_c[0]

draw.text((286 + w_g + w_c + 7, 176), "POS", font=font_title, fill=LIGHT_GRAY)

# Draw Card Header Text
draw.text((435, 220), "Kirim Barang", font=font_card, fill=WHITE)

# Draw Button Text centered
draw.text((298, 455), "Bayar / Kirim", font=font_btn, fill=WHITE)


# ====================================================
# 2. CARDBOARD BOX STAMP (Tilts -10.0° matching 3D perspective)
# ====================================================
box_arr = np.array(img)
# Clean only the old text area (X: 260..370, Y: 665..725)
box_patch = box_arr[665:725, 260:370, :3].copy()
is_ink = (box_patch[:, :, 0] < 145) & (box_patch[:, :, 1] < 115) & (box_patch[:, :, 2] < 90)
mask_im = Image.fromarray(is_ink.astype(np.uint8) * 255)
mask_dilated = np.array(mask_im.filter(ImageFilter.MaxFilter(7))) > 0

clean_base = box_patch.copy()
med_color = np.median(box_patch[~mask_dilated], axis=0)
clean_base[mask_dilated] = med_color
blurred = np.array(Image.fromarray(clean_base).filter(ImageFilter.GaussianBlur(5)))
noise = np.random.normal(0, 1.8, box_patch.shape)

box_patch[mask_dilated] = np.clip(blurred[mask_dilated] + noise[mask_dilated], 0, 255).astype(np.uint8)
box_arr[665:725, 260:370, :3] = box_patch
img = Image.fromarray(box_arr)

# Create official stamp layer with G-mark + "GeraiCuan"
stamp_layer = Image.new('RGBA', (150, 40), (0, 0, 0, 0))
stamp_draw = ImageDraw.Draw(stamp_layer)

mark_512 = Image.open('logos/rendered-mark-512.png').convert('RGBA')
mark_arr = np.array(mark_512)
solid_ink = np.zeros_like(mark_arr)
solid_ink[:, :, 0] = STAMP_BROWN[0]
solid_ink[:, :, 1] = STAMP_BROWN[1]
solid_ink[:, :, 2] = STAMP_BROWN[2]
solid_ink[:, :, 3] = mark_arr[:, :, 3]
stamp_mark = Image.fromarray(solid_ink).resize((22, 22), Image.Resampling.LANCZOS)
stamp_layer.paste(stamp_mark, (2, 8), stamp_mark)

stamp_draw.text((30, 9), "GeraiCuan", font=font_box, fill=STAMP_BROWN)
bbox_stamp = stamp_layer.getbbox()
crop_stamp = stamp_layer.crop(bbox_stamp)
# Rotate -10.0 degrees matching exact box face slope
stamp_rot = crop_stamp.rotate(-10.0, resample=Image.Resampling.BICUBIC, expand=True)

# Centered placement on box front face (X: 244, Y: 674)
img.paste(stamp_rot, (244, 674), stamp_rot)


# ====================================================
# 3. THERMAL PRINTER CASING
# ====================================================
p_arr = np.array(img)
# Inpaint old text on plastic casing (X: 790..890, Y: 568..584)
p_patch = p_arr[568:584, 790:890, :3].copy()
is_text_p = np.mean(p_patch, axis=2) > 145
mask_p = np.array(Image.fromarray(is_text_p.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5))) > 0

clean_p = p_patch.copy()
clean_p[mask_p] = np.median(p_patch[~mask_p], axis=0)
blurred_p = np.array(Image.fromarray(clean_p).filter(ImageFilter.GaussianBlur(3)))
p_patch[mask_p] = blurred_p[mask_p]
p_arr[568:584, 790:890, :3] = p_patch

# Recolor LED status button to glowing Emerald Green (preserving 3D lighting)
patch_btn = p_arr[566:578, 904:917, :3].copy()
btn_mask = (patch_btn[:, :, 2] > 140) & (patch_btn[:, :, 1] > 130)
for r in range(patch_btn.shape[0]):
    for c in range(patch_btn.shape[1]):
        if btn_mask[r, c]:
            lum = (0.299 * patch_btn[r, c, 0] + 0.587 * patch_btn[r, c, 1] + 0.114 * patch_btn[r, c, 2]) / 180.0
            new_r = int(np.clip(16 * lum * 1.8, 0, 255))
            new_g = int(np.clip(185 * lum, 0, 255))
            new_b = int(np.clip(129 * lum, 0, 255))
            patch_btn[r, c] = [new_r, new_g, new_b]
p_arr[566:578, 904:917, :3] = patch_btn

img = Image.fromarray(p_arr)
draw = ImageDraw.Draw(img)

# Restamp on printer casing: White G-mark + "GeraiCuan" in metallic silver
printer_mark = mark_white.resize((12, 12), Image.Resampling.LANCZOS)
img.paste(printer_mark, (806, 571), printer_mark)
draw.text((822, 571), "GeraiCuan", font=font_printer, fill=(225, 230, 235, 255))


# ====================================================
# 4. THERMAL SHIPPING LABEL
# ====================================================
l_arr = np.array(img)
# Clean only the text pixels on the paper face (X: 814..904, Y: 645..660)
l_patch = l_arr[645:660, 814:904, :3].copy()
is_text_l = np.mean(l_patch, axis=2) < 210
mask_l = np.array(Image.fromarray(is_text_l.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(3))) > 0

clean_paper = np.array([242, 242, 241], dtype=np.uint8)
l_patch[mask_l] = clean_paper
l_arr[645:660, 814:904, :3] = l_patch
img = Image.fromarray(l_arr)

# Draw "GeraiCuan" on shipping label in bold black thermal print font
draw = ImageDraw.Draw(img)
draw.text((822, 646), "GeraiCuan", font=font_label, fill=(30, 30, 30, 255))

# ====================================================
# 5. SAVE FINAL OUTPUT
# ====================================================
final_output = 'hero-geraicuan-v2.jpg'
img.convert('RGB').save(final_output, quality=96, optimize=True)
print(f'Master hero update successfully completed and saved to {final_output}!')
