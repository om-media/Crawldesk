"""Generate halftone animation for CrawlDesk branding."""
#!/usr/bin/env python3
"""Animated halftone Crawldesk GIF — character density art."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import struct
import os

# ─── Config ──────────────────────────────────────────────────────
W, H = 640, 360          # output resolution
FPS = 15
DURATION = 6             # seconds
CHARS = ' .:-=+*#%@'     # halftone density ramp (sparse → dense)
FONT_SIZE = 8
GRID_W, GRID_H = W // FONT_SIZE, H // FONT_SIZE

# ─── Color palette — teal/cyan tech vibe ─────────────────────────
def hsl_to_rgb(h, s, l):
    """Convert HSL to RGB (0-255)."""
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if h < 60: r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else: r, g, b = c, 0, x
    return int((r + m) * 255), int((g + m) * 255), int((b + m) * 255)

# ─── Generate halftone frames ────────────────────────────────────
def make_frame(t):
    """Create one frame of halftone animation."""
    canvas = np.zeros((H, W, 3), dtype=np.uint8)
    
    # Background — deep dark teal
    for y in range(H):
        for x in range(W):
            canvas[y, x] = hsl_to_rgb(190, 0.3, 0.05)
    
    # Animated halftone waves
    time = t * 2
    
    # Layer 1: flowing diagonal waves
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            px, py = gx * FONT_SIZE, gy * FONT_SIZE
            
            # Multiple wave interference
            v1 = np.sin(gx * 0.15 + time) * 0.3
            v2 = np.sin(gy * 0.12 - time * 0.7) * 0.3
            v3 = np.sin((gx + gy) * 0.08 + time * 1.3) * 0.2
            v4 = np.sin(np.sqrt((gx - GRID_W/2)**2 + (gy - GRID_H/2)**2) * 0.15 - time * 2) * 0.4
            
            intensity = max(0, min(1, v1 + v2 + v3 + v4 + 0.8))
            
            # Map to character
            ci = int(intensity * (len(CHARS) - 1))
            char = CHARS[ci]
            
            # Color based on position and time
            hue = (170 + intensity * 60 + time * 20) % 360
            sat = 0.6 + intensity * 0.4
            light = 0.15 + intensity * 0.55
            r, g, b = hsl_to_rgb(hue, sat, light)
            
            # Draw character
            for dy in range(FONT_SIZE):
                for dx in range(FONT_SIZE):
                    nx, ny = px + dx, py + dy
                    if 0 <= nx < W and 0 <= ny < H:
                        canvas[ny, nx] = (r, g, b)
    
    # Layer 2: Crawling dots — spider-web pattern
    for i in range(80):
        angle = (i / 80) * np.pi * 2 + time * 0.5
        radius = 40 + 30 * np.sin(time + i * 0.3)
        
        cx = W/2 + np.cos(angle) * radius * 1.5
        cy = H/2 + np.sin(angle) * radius
        
        # Draw small dense cluster
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = int(cx + dx), int(cy + dy)
                if 0 <= nx < W and 0 <= ny < H:
                    dist = np.sqrt(dx*dx + dy*dy)
                    if dist < 3.5:
                        density = max(0, 1 - dist / 3.5)
                        ci = int(density * (len(CHARS) - 1))
                        char = CHARS[ci]
                        hue = (190 + i * 2) % 360
                        r, g, b = hsl_to_rgb(hue, 0.8, 0.3 + density * 0.4)
                        canvas[ny, nx] = (r, g, b)
    
    # Layer 3: Central logo text area — "CRAWLDESK" in halftone
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 48)
    except:
        font = ImageFont.load_default()
    
    # Create text mask
    text_img = Image.new('L', (W, H), 0)
    draw = ImageDraw.Draw(text_img)
    bbox = draw.textbbox((0, 0), "CRAWLDESK", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = (W - tw) // 2, (H - th) // 2
    draw.text((tx, ty), "CRAWLDESK", fill=255, font=font)
    
    # Overlay halftone on text area
    text_arr = np.array(text_img)
    for gy in range(GRID_H):
        for gx in range(GRID_W):
            px, py = gx * FONT_SIZE, gy * FONT_SIZE
            
            # Check if this cell is inside text
            cell_center_x, cell_center_y = px + FONT_SIZE//2, py + FONT_SIZE//2
            if 0 <= cell_center_y < H and 0 <= cell_center_x < W:
                if text_arr[cell_center_y, cell_center_x] > 128:
                    # Inside text — bright halftone
                    pulse = np.sin(time * 3 + gx * 0.1) * 0.15
                    intensity = 0.7 + pulse
                    
                    ci = int(intensity * (len(CHARS) - 1))
                    char = CHARS[ci]
                    
                    # Bright cyan/teal for text
                    r, g, b = hsl_to_rgb(180, 0.9, 0.6 + intensity * 0.3)
                    
                    for dy in range(FONT_SIZE):
                        for dx in range(FONT_SIZE):
                            nx, ny = px + dx, py + dy
                            if 0 <= nx < W and 0 <= ny < H:
                                canvas[ny, nx] = (r, g, b)
    
    return canvas

# ─── Render frames ───────────────────────────────────────────────
total_frames = FPS * DURATION
frames = []

print(f"Rendering {total_frames} frames at {FPS}fps...")
for i in range(total_frames):
    t = i / FPS
    frame = make_frame(t)
    img = Image.fromarray(frame, 'RGB')
    frames.append(img)
    if (i + 1) % 30 == 0:
        print(f"  Frame {i+1}/{total_frames}")

# ─── Save as animated GIF ────────────────────────────────────────
output_path = "/mnt/z/AIProjects/OpenCrawler/crawldesk_halftone.gif"
frames[0].save(
    output_path,
    save_all=True,
    append_images=frames[1:],
    duration=1000 // FPS,
    loop=0,
    optimize=True,
)

print(f"\n✓ Saved to: {output_path}")
print(f"  Size: {os.path.getsize(output_path) / 1024:.1f} KB")
print(f"  Frames: {len(frames)}")
print(f"  Duration: {DURATION}s @ {FPS}fps")
