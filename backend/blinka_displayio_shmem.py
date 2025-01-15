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
                    time.sleep(1 / 1000 / 10)
                self.framebuffer[:] = buffer.tobytes()
                a.store(0)

            return self.framebuffer