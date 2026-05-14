import struct

# Create a minimal valid ICO file (version 3.00 format)
output = bytearray()

# ICONDIR header (6 bytes)
output += struct.pack('<HHH', 0, 1, 1)  # reserved=0, type=1(ICO), count=1

# ICONDIRENTRY (16 bytes) - version 3.00 format
output += struct.pack('<BBBBHHII',
    16,           # width (0 = 256)
    16,           # height (0 = 256)
    0,            # color count (0 = >=256 colors)
    0,            # reserved
    1,            # color planes
    32,           # bits per pixel
    76 + 40,      # size of image data
    22            # offset to image data (6 + 16 = 22)
)

# BITMAPINFOHEADER (40 bytes) - 11 fields: IIIHHIIIIII
# biSize(I=4) + biWidth(I=4) + biHeight(I=4) + biPlanes(H=2) + biBitCount(H=2) +
# biCompression(I=4) + biSizeImage(I=4) + biXPelsPerMeter(I=4) + biYPelsPerMeter(I=4) +
# biClrUsed(I=4) + biClrImportant(I=4) = 40 bytes
output += struct.pack('<IIIHHIIIIII',
    40,           # biSize (DWORD)
    16,           # biWidth (LONG)
    32,           # biHeight (LONG) - doubled for XOR+AND masks
    1,            # biPlanes (WORD)
    32,           # biBitCount (WORD) - 32bpp
    0,            # biCompression (DWORD) - BI_RGB
    2048,         # biSizeImage (DWORD) - pixel data size
    0,            # biXPelsPerMeter (LONG)
    0,            # biYPelsPerMeter (LONG)
    0,            # biClrUsed (DWORD)
    0             # biClrImportant (DWORD)
)

# For ICO with 32bpp and width=16:
# DIB height = 32 (doubled for XOR mask + AND mask)
# Row size must be 4-byte aligned: ceil(16*4/4)*4 = 64 bytes per row
# Total pixel data = 64 * 32 = 2048 bytes
row_size = (16 * 4 + 3) & ~3  # 64 bytes (4-byte aligned)
pixel_size = row_size * 32  # 2048 bytes
output += b'\x00' * pixel_size

total_bmp = 40 + pixel_size  # BITMAPINFOHEADER + pixel data

with open(r'icon.ico', 'wb') as f:
    f.write(output)

print(f"Created ICO: {len(output)} bytes")
print(f"BMP section: {total_bmp} bytes (header={40}, pixels={pixel_size})")
entry = output[6:22]
offset, img_size = struct.unpack_from('<II', entry, 8)
print(f"ICONDIRENTRY: offset={offset}, size={img_size}")
assert offset == 22, f"Expected offset=22, got {offset}"
assert img_size == total_bmp, f"Expected size={total_bmp}, got {img_size}"
print("ICO structure verified OK")
