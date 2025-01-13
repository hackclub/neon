import displayio
from PIL import Image
from multiprocessing import shared_memory


class ShmemDisplay():
    root_group = None
    auto_refresh = False
    brightness = 1.0
    width = 64
    height = 32
    rotation = 0

    _shmem = None
    framebuffer = None

    def __init__(self, name):
        self._shmem = shared_memory.SharedMemory(name=name, track=False)
        self.framebuffer = self._shmem.buf[:8192]

    def refresh(self):
        self._group_to_buffer()

    def _group_to_buffer(self):
        if self.root_group is not None:
            buffer = Image.new("RGBA", (self.width, self.height))

            self.root_group._fill_area(
                buffer
            )

            self.framebuffer = buffer.tobytes()

            return self.framebuffer


if __name__ == '__main__':

    display = ShmemDisplay("blinka")

    splash = displayio.Group()

    color_bitmap = displayio.Bitmap(display.width, display.height, 1)
    color_palette = displayio.Palette(1)
    color_palette[0] = 0x00FF00  # Bright Green

    bg_sprite = displayio.TileGrid(color_bitmap, pixel_shader=color_palette, x=0, y=0)
    splash.append(bg_sprite)

    display.root_group = splash
    print(len(display._group_to_buffer()))

    while True:
        pass
