import os
import sys

import atomics # this has to be imported before displayio... for some reason?

old_stdout = sys.stdout
sys.stdout = open(os.devnull, 'w')
import displayio
sys.stdout = old_stdout

sys.modules['displayio'] = displayio
