import os
import sys

import atomics # this has to be imported before displayio... for some reason?

old_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
import displayio
sys.stdout = old_stdout

sys.modules['displayio'] = displayio

class _RGBMatrix:
    def __init__(self, width=32, height=32, bit_depth=0,
                 rgb_pins=None, addr_pins=None,
                 clock_pin=None, latch_pin=None, output_enable_pin=None):
        pass

class rgbmatrix:
    RGBMatrix = _RGBMatrix

sys.modules['rgbmatrix'] = rgbmatrix()

class Board:
    def __getattr__(self, item):
        return True

sys.modules['board'] = Board() 