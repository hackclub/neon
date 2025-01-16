import {type RefObject, useEffect, useRef} from "react";
import {
    crosshairCursor,
    drawSelection,
    EditorView, highlightActiveLine,
    highlightActiveLineGutter,
    highlightSpecialChars, keymap,
    lineNumbers, rectangularSelection, ViewPlugin
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
import "./codemirror.css"

import { python } from "@codemirror/lang-python";

const default_text = `import time
import displayio
import terminalio
from rainbowio import colorwheel
import adafruit_display_text.label

import neon_display

display = neon_display.NeonDisplay()
# Create a tilegrid with a bunch of common settings
# Create two lines of text to scroll. Besides changing the text, you can also
# customize the color and font (using Adafruit_CircuitPython_Bitmap_Font).
# To keep this demo simple, we just used the built-in font.
# The Y coordinates of the two lines were chosen so that they looked good
# but if you change the font you might find that other values work better.
line1 = adafruit_display_text.label.Label(
    terminalio.FONT,
    color=0xff0000, 
    text="Hack Club!!!")
line1.x = display.width - 20
line1.y = 8

line2 = adafruit_display_text.label.Label(
    terminalio.FONT,
    color=0x0080ff,
    text="Hello to all")
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
    print(count)
    count += 1
    time.sleep(0.01)
    scroll(line1)
    scroll(line2)
    #reverse_scroll(line2)
    display.refresh()`

export default function CodeMirror({editorRef}: {editorRef: RefObject<any>}) {
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
            ViewPlugin.fromClass(class {
                update(update: any) {
                    if (update.docChanged) onDocChange()
                }
            })
        ];

        let state = EditorState.create({
            extensions,
            doc: localStorage.getItem('text') ?? default_text
        })

        let editor = new EditorView({state, parent: parent.current ?? undefined});

        editorRef.current = editor

        let onDocChange = () => {
            console.log("hi")
            localStorage.setItem('text', editor.state.doc.toString())
        }

        return () => editor.destroy()
    }, []);


    return <div ref={parent} style={{flex: 1, height: "100%"}}></div>
}