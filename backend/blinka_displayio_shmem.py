import array
import mmap
import os
import sys
import time
import atomics
import terminalio
from rainbowio import colorwheel
import adafruit_display_text.label

old_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
import displayio
sys.stdout = old_stdout

class ShmemDisplay():
    root_group = None
    auto_refresh = False
    brightness = 1.0
    width = 64
    height = 32
    rotation = 0

    _mmap = None
    _lock = None
    framebuffer = None

    def __init__(self, name):
        fd = open("/dev/shm/" + name, mode='r+')
        self._mmap = memoryview(mmap.mmap(fd.fileno(), 0))
        self.framebuffer = self._mmap[4:8192 + 4]
        self._lock = self._mmap[:4]

    def __del__(self):
        del self.framebuffer
        del self._lock

    def refresh(self):
        self._group_to_buffer()

    def _group_to_buffer(self):
        if self.root_group is not None:
            buffer = memoryview(bytearray(32*64*4))

            self.root_group._fill_area(
                displayio._structs.ColorspaceStruct(32),
                displayio._area.Area(0, 0, self.width, self.height),
                [0 for _ in range(32*64 // 32)],

                buffer
            )


            with atomics.atomicview(self._lock, atomics.UINT) as a:
                while not a.cmpxchg_weak(0, 1):
                    time.sleep(1 / 1000)
                self.framebuffer[:] = buffer.tobytes()
                a.store(0)

            return self.framebuffer


""" if __name__ == '__main__':

    display = ShmemDisplay("neon")

    splash = displayio.Group()

    color_bitmap = displayio.Bitmap(display.width, display.height, 1)
    color_palette = displayio.Palette(1)
    color_palette[0] = 0x00FF00  # Bright Green

    bg_sprite = displayio.TileGrid(color_bitmap, pixel_shader=color_palette, x=0, y=0)
    splash.append(bg_sprite)

    display.root_group = splash
    display._group_to_buffer()
    print(display.framebuffer[0])

    while True:
        pass """

display = ShmemDisplay("neon")
# Create a tilegrid with a bunch of common settings
# Create two lines of text to scroll. Besides changing the text, you can also
# customize the color and font (using Adafruit_CircuitPython_Bitmap_Font).
# To keep this demo simple, we just used the built-in font.
# The Y coordinates of the two lines were chosen so that they looked good
# but if you change the font you might find that other values work better.
line1 = adafruit_display_text.label.Label(
    terminalio.FONT,
    color=0xff0000,
    text="This scroller is brought to you by CircuitPython RGBMatrix")
line1.x = display.width
line1.y = 8

line2 = adafruit_display_text.label.Label(
    terminalio.FONT,
    color=0x0080ff,
    text="Hello to all CircuitPython contributors worldwide <3")
line2.x = display.width
line2.y = 24

# Put each line of text into a Group, then show that group.
g = displayio.Group()
g.append(line1)
g.append(line2)
display.root_group = g

# This function will scoot one label a pixel to the left and send it back to
# the far right if it's gone all the way off screen. This goes in a function
# because we'll do exactly the same thing with line1 and line2 below.
def scroll(line):
    line.x = line.x - 1
    line_width = line.bounding_box[2]
    if line.x < -line_width:
        line.x = display.width

# This function scrolls lines backwards.  Try switching which function is
# called for line2 below!
def reverse_scroll(line):
    line.x = line.x + 1
    line_width = line.bounding_box[2]
    if line.x >= display.width:
        line.x = -line_width

# You can add more effects in this loop. For instance, maybe you want to set the
# color of each label to a different value.
count = 0
while True:
    count += 1
    time.sleep(0.01)
    scroll(line1)
    scroll(line2)
    #reverse_scroll(line2)
    display.refresh()