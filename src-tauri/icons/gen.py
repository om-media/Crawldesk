#!/usr/bin/env python3
"""Generate a minimal valid ICO file (version 3.00 format) compatible with MSVC RC.EXE."""

import struct
import os

def generate_minimal_ico():
    """Generate a 16x16, 32bpp ICO file."""
    
    # ---- ICONDIR header (6 bytes) ----
    # Type 1 = ICO, 1 image
    icondir = struct.pack('<HHH', 0, 1, 1)
    
    # ---- ICONDIRENTRY (16 bytes) - version 3.00 format ----
    width = 16
    height = 16
    colors = 0      # >= 256 colors
    reserved = 0
    planes = 1
    bpp = 32        # 32 bits per pixel (supports alpha)
    
    # BITMAPINFOHEADER is always 40 bytes
    dib_header_size = 40
    
    # For ICO with 32bpp, the DIB height must be doubled to include AND mask
    dib_height = height * 2  # 32
    
    # Each row in the BMP data must be aligned to 4 bytes
    row_bytes = (width * bpp + 31) // 32 * 4  # (16*32+31)//32*4 = 64 bytes per row
    pixel_data_size = row_bytes * dib_height   # 64 * 32 = 2048 bytes
    
    # Total size of BMP data (DIB header + pixel data)
    bmp_data_size = dib_header_size + pixel_data_size
    
    # Offset from start of ICO file to pixel data
    # ICONDIR(6) + ICONDIRENTRY(16) = 22 bytes
    offset_to_bitmap = 22
    
    icondirentry = struct.pack('<BBBBHHII',
        width,           # width (1 byte)
        height,          # height (1 byte)
        colors,          # color count (1 byte)
        reserved,        # reserved (1 byte)
        planes,          # color planes (2 bytes)
        bpp,             # bits per pixel (2 bytes)
        bmp_data_size,   # size of image data (4 bytes)
        offset_to_bitmap # offset to image data (4 bytes)
    )
    
    # ---- BITMAPINFOHEADER (40 bytes) ----
    # Format: IIIHHIIIIII = 4+4+4+2+2+4+4+4+4+4+4 = 40 bytes
    dib_header = struct.pack('<IIIHHIIIIII',
        dib_header_size,  # biSize (DWORD) = 40
        width,            # biWidth (LONG) = 16
        dib_height,       # biHeight (LONG) = 32 (doubled for ICO AND mask)
        planes,           # biPlanes (WORD) = 1
        bpp,              # biBitCount (WORD) = 32
        0,                # biCompression (DWORD) = BI_RGB
        pixel_data_size,  # biSizeImage (DWORD)
        0,                # biXPelsPerMeter (LONG)
        0,                # biYPelsPerMeter (LONG)
        0,                # biClrUsed (DWORD)
        0                 # biClrImportant (DWORD)
    )
    
    # ---- Pixel data ----
    # All zeros = fully transparent
    pixel_data = b'\x00' * pixel_data_size
    
    # ---- Assemble the ICO file ----
    ico_data = icondir + icondirentry + dib_header + pixel_data
    
    # Write to file
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon.ico')
    with open(output_path, 'wb') as f:
        f.write(ico_data)
    
    print(f"Generated ICO file: {output_path}")
    print(f"  Total size: {len(ico_data)} bytes")
    print(f"  Dimensions: {width}x{height}")
    print(f"  Bits per pixel: {bpp}")
    print(f"  DIB height (doubled): {dib_height}")
    print(f"  Pixel data size: {pixel_data_size} bytes")
    print(f"  Offset to bitmap: {offset_to_bitmap} bytes")
    
    # Verify structure
    with open(output_path, 'rb') as f:
        data = f.read()
    
    assert len(data) == 6 + 16 + 40 + pixel_data_size, "Size mismatch"
    
    # Check ICONDIR
    magic, type_, count = struct.unpack_from('<HHH', data, 0)
    assert magic == 0, f"Reserved must be 0, got {magic}"
    assert type_ == 1, f"Type must be 1 (ICO), got {type_}"
    assert count == 1, f"Count must be 1, got {count}"
    
    # Check ICONDIRENTRY
    w, h, c, r, p, b, sz, off = struct.unpack_from('<BBBBHHII', data, 6)
    assert w == 16 and h == 16, f"Dimensions mismatch: {w}x{h}"
    assert b == 32, f"BPP must be 32, got {b}"
    assert sz == bmp_data_size, f"Size mismatch: {sz} vs {bmp_data_size}"
    assert off == 22, f"Offset mismatch: {off} vs 22"
    
    # Check BITMAPINFOHEADER
    ds, dw, dh, dp, db, dc, di, dxp, dyp, dcu, dci = struct.unpack_from('<IIIHHIIIIII', data, 22)
    assert ds == 40, f"DIB header size must be 40, got {ds}"
    assert dw == 16 and dh == 32, f"DIB dimensions mismatch: {dw}x{dh}"
    assert db == 32, f"DIB BPP must be 32, got {db}"
    
    print("\nICO structure verified successfully!")

if __name__ == '__main__':
    generate_minimal_ico()
