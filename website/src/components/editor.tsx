import styles from "./editor.module.css"
import Navbar from "./navbar.tsx";

import {type RefObject, useEffect, useImperativeHandle, useRef, useState} from "react";
import CodeMirror from "./codemirror.tsx";
import {late} from "zod";

type Color = [number, number, number];

function Matrix({codemirror, run, stop}: {codemirror: any, run: RefObject<any>, stop: RefObject<any>}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [websocket, setWebsocket] = useState<WebSocket>();

    useImperativeHandle(run, () => () => {
        websocket?.close()

        const socket = new WebSocket("ws://localhost:8080/run?code=" + encodeURIComponent(codemirror.current.state.doc.toString()));
        setWebsocket(socket)

        socket.onmessage = async (event) => {
            const arrayBuffer = await new Response(event.data).arrayBuffer()
            const arr = new Uint8Array(arrayBuffer)

            const matrix: Color[][] = Array.from({length: 32}, _ =>
                Array.from({length: 64}, _ =>
                    [0,0,0] as Color))

            for (let i = 0; i < 64*32; i++) {
                matrix[Math.floor(i / 64)][i % 64] = [arr[i*4+1], arr[i*4+2], arr[i*4+3]]
            }

            update(matrix)
        }
    }, [websocket])

    useImperativeHandle(stop, () => () => {
        websocket?.close()
    }, [websocket])

    function update(matrix: Color[][]) {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let row = 0; row < canvas.height; row++) {
            for (let col = 0; col < canvas.width; col++) {
                ctx.fillStyle = `rgb(${matrix[row][col].join(" ")})`
                ctx.fillRect(col, row, 1, 1)
            }
        }
    }



    return <canvas width={64} height={32} ref={canvasRef} className={styles.matrix} />
}

export default function Editor() {
    const run = useRef<any>(null)
    const stop = useRef<any>(null)

    const editor = useRef<any>(null)

    return <div className={styles.parent}>
        <Navbar />
        <div className={styles.editor}>
            <div className={styles.codeMirror}>
                <CodeMirror editorRef={editor} />
            </div>
            <div className={styles.output}>
                <Matrix run={run} stop={stop} codemirror={editor}></Matrix>
                <button onClick={() => run.current()}>run</button>
                <button onClick={() => stop.current()}>stop</button>
            </div>
        </div>
    </div>
}