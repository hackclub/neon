import {useEffect, useRef} from "react";
import {
    crosshairCursor,
    drawSelection,
    EditorView, highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars, keymap,
    lineNumbers, rectangularSelection
} from "@codemirror/view";
import {EditorState} from "@codemirror/state";
import {
    bracketMatching, defaultHighlightStyle,
    foldGutter,
    foldKeymap,
    indentOnInput,
    indentUnit,
    syntaxHighlighting
} from "@codemirror/language";
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from "@codemirror/autocomplete";
import {highlightSelectionMatches} from "@codemirror/search";
import {defaultKeymap, historyKeymap, indentWithTab, history} from "@codemirror/commands";

import { python } from "@codemirror/lang-python";

export default function CodeMirror() {
    let parent = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            highlightSpecialChars(),
            history(),
            foldGutter(),
            drawSelection(),
            indentUnit.of("    "),
            EditorState.allowMultipleSelections.of(true),
            indentOnInput(),
            bracketMatching(),
            closeBrackets(),
            autocompletion(),
            rectangularSelection(),
            crosshairCursor(),
            highlightActiveLine(),
            highlightSelectionMatches(),
            keymap.of([
                indentWithTab,
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                ...foldKeymap,
                ...completionKeymap,
            ]),
            python(),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        ];

        let state = EditorState.create({
            doc: "display = ShmemDisplay(\"neon\")\n" +
                "# Create a tilegrid with a bunch of common settings\n" +
                "# Create two lines of text to scroll. Besides changing the text, you can also\n" +
                "# customize the color and font (using Adafruit_CircuitPython_Bitmap_Font).\n" +
                "# To keep this demo simple, we just used the built-in font.\n" +
                "# The Y coordinates of the two lines were chosen so that they looked good\n" +
                "# but if you change the font you might find that other values work better.\n" +
                "line1 = adafruit_display_text.label.Label(\n" +
                "    terminalio.FONT,\n" +
                "    color=0xff0000,\n" +
                "    text=\"This scroller is brought to you by CircuitPython RGBMatrix\")\n" +
                "line1.x = display.width\n" +
                "line1.y = 8\n" +
                "\n" +
                "line2 = adafruit_display_text.label.Label(\n" +
                "    terminalio.FONT,\n" +
                "    color=0x0080ff,\n" +
                "    text=\"Hello to all CircuitPython contributors worldwide <3\")\n" +
                "line2.x = display.width\n" +
                "line2.y = 24\n" +
                "\n" +
                "# Put each line of text into a Group, then show that group.\n" +
                "g = displayio.Group()\n" +
                "g.append(line1)\n" +
                "g.append(line2)\n" +
                "display.root_group = g\n" +
                "\n" +
                "# This function will scoot one label a pixel to the left and send it back to\n" +
                "# the far right if it's gone all the way off screen. This goes in a function\n" +
                "# because we'll do exactly the same thing with line1 and line2 below.\n" +
                "def scroll(line):\n" +
                "    line.x = line.x - 1\n" +
                "    line_width = line.bounding_box[2]\n" +
                "    if line.x < -line_width:\n" +
                "        line.x = display.width\n" +
                "\n" +
                "# This function scrolls lines backwards.  Try switching which function is\n" +
                "# called for line2 below!\n" +
                "def reverse_scroll(line):\n" +
                "    line.x = line.x + 1\n" +
                "    line_width = line.bounding_box[2]\n" +
                "    if line.x >= display.width:\n" +
                "        line.x = -line_width\n" +
                "\n" +
                "# You can add more effects in this loop. For instance, maybe you want to set the\n" +
                "# color of each label to a different value.\n" +
                "count = 0\n" +
                "while True:\n" +
                "    print(count)\n" +
                "    count += 1\n" +
                "    time.sleep(0.01)\n" +
                "    scroll(line1)\n" +
                "    scroll(line2)\n" +
                "    #reverse_scroll(line2)\n" +
                "    display.refresh()"
        })

        let editor = new EditorView({state, parent: parent.current ?? undefined, extensions});
    }, []);


    return <div ref={parent}></div>
}