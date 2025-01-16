import styles from "./editor.module.css"
import Navbar from "./navbar.tsx";

import {type RefObject, useEffect, useImperativeHandle, useRef, useState} from "react";
import CodeMirror from "./codemirror.tsx";

type Color = [number, number, number];

function Matrix({update}: {update: RefObject<any>}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(update, () => (matrix: Color[][]) => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let row = 0; row < canvas.height; row++) {
            for (let col = 0; col < canvas.width; col++) {
                ctx.fillStyle = `rgb(${matrix[row][col].join(" ")})`
                ctx.fillRect(col, row, 1, 1)
            }
        }

    })

    return <canvas width={64} height={32} ref={canvasRef} className={styles.matrix} />
}

export default function Editor() {
    const update = useRef<any>(null)
    const editor = useRef<any>(null)

    const consoleRef = useRef<any>(null)

    const [websocket, setWebsocket] = useState<WebSocket>();
    const [consoleLines, setConsoleLines] = useState<string[]>([]);

    function run() {
        websocket?.close()
        setConsoleLines([])

        const socket = new WebSocket("ws://localhost:8080/run?code=" + encodeURIComponent(editor.current.state.doc.toString()));
        setWebsocket(socket)

        socket.onmessage = async (event) => {
            if (typeof event.data === "string") {
                setConsoleLines(lines => [...lines, event.data])
                consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
                return
            }

            const arrayBuffer = await new Response(event.data).arrayBuffer()
            const arr = new Uint8Array(arrayBuffer)

            const matrix: Color[][] = Array.from({length: 32}, _ =>
                Array.from({length: 64}, _ =>
                    [0,0,0] as Color))

            for (let i = 0; i < 64*32; i++) {
                matrix[Math.floor(i / 64)][i % 64] = [arr[i*4+1], arr[i*4+2], arr[i*4+3]]
            }

            update.current(matrix)
        }
    }

    function stop() {
        websocket?.close()
    }

    return <div className={styles.parent}>
        <Navbar />
        <div className={styles.editor}>
            <div className={styles.codeMirror}>
                <CodeMirror editorRef={editor} />
            </div>
            <div className={styles.output}>
                <Matrix update={update}></Matrix>
                <div className={styles.buttons}>
                    <button onClick={() => run()} className={styles.button}>run</button>
                    <button onClick={() => stop()} className={styles.button}>stop</button>
                    <button onClick={() => {
                        let element = document.createElement("a")
                        element.setAttribute("href", "data:text/plain;charset=utf-8,"
                            + encodeURIComponent(editor.current.state.doc.toString()));
                        element.setAttribute('download', "code.py")
                        element.click()
                    }} className={styles.button}>download</button>
                </div>
                console output:
                <div className={styles.console} ref={consoleRef}>
                    {consoleLines.map(line => <p>{line}</p>)}
                </div>
            </div>
        </div>
    </div>
}