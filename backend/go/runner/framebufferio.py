import mmap
import threading
import time
import atomics
import displayio

class FramebufferDisplay():
    root_group = None
    auto_refresh = False
    brightness = 1.0
    width = 64
    height = 32
    rotation = 0

    _mmap = None
    _lock = None
    framebuffer = None

    _refresh_thread = None
    _refresh_event = None

    def __init__(self, matrix, auto_refresh=False):
        fd = open("/dev/shm/neon", mode='r+')
        self._mmap = memoryview(mmap.mmap(fd.fileno(), 0))
        self.framebuffer = self._mmap[4:8192 + 4]
        self._lock = self._mmap[:4]
        self.auto_refresh = auto_refresh

    def __del__(self):
        del self.framebuffer
        del self._lock

    @property
    def auto_refresh(self):
        return self._refresh_thread is not None

    @auto_refresh.setter
    def auto_refresh(self, value):
        if value and self._refresh_thread is None:
            self._refresh_thread = threading.Thread(target=self.run_auto_refresh)
            self._refresh_event = threading.Event()
            self._refresh_thread.start()
        elif not value and self._refresh_thread is not None:
            self._refresh_event.set()
            self._refresh_thread = None

    def run_auto_refresh(self):
        while not self._refresh_event.is_set():
            time.sleep(1/50)
            self.refresh()

    def refresh(self, minimum_frames_per_second=0):
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