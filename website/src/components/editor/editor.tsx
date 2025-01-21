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
        for (let row = 0; row < 32; row++) {
            for (let col = 0; col < 64; col++) {
                ctx.fillStyle = `rgb(${matrix[row][col].join(" ")})`
                ctx.fillRect(col*5+1, row*5+1, 3, 3)
            }
        }

        const gridLinesColor = `rgb(27, 27, 27)`

        for (let col = 0; col < 64; col++) {
            ctx.fillStyle = gridLinesColor
            ctx.fillRect(col*5+4, 0, 2, 32*5)
        }

        for (let row = 0; row < 32; row++) {
            ctx.fillStyle = gridLinesColor
            ctx.fillRect(0, row*5+4, 64*5, 2)
        }

    })

    return <canvas width={64*5} height={32*5} ref={canvasRef} className={styles.matrix} />
}

export default function Editor() {
    const update = useRef<any>(null)
    const editor = useRef<any>(null)

    const consoleRef = useRef<any>(null)

    const [websocket, setWebsocket] = useState<WebSocket>();
    const [consoleLines, setConsoleLines] = useState<string[]>(["nothing yet!"]);

    const [running, setRunning] = useState(false);

    useEffect(() => {
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }, [consoleLines]);

    function run() {
        websocket?.close()
        setConsoleLines([])

        const socket = new WebSocket("wss://dg84ks0sos0s48c00sg8kco0.a.selfhosted.hackclub.com/run?code=" + encodeURIComponent(editor.current.state.doc.toString()));
        setWebsocket(socket)

        socket.onmessage = async (event) => {
            console.log("recieved")
            if (typeof event.data === "string") {
                setConsoleLines(lines => [...lines, event.data])
                return
            }

            const arrayBuffer = await new Response(event.data).arrayBuffer()
            const arr = new Uint8Array(arrayBuffer)

            const matrix: Color[][] = Array.from({length: 32}, _ =>
                Array.from({length: 64}, _ =>
                    [0,0,0] as Color))

            for (let i = 0; i < 64*32; i++) {
                matrix[Math.floor(i / 64)][i % 64] = [arr[i*4+2], arr[i*4+1], arr[i*4]]
            }

            update.current(matrix)
        }

        socket.onopen = () => setRunning(true)
        socket.onclose = () => setWebsocket(websocket => {
            if (websocket == socket) setRunning(false)
            return websocket
        })
    }

    function stop() {
        setRunning(false)
        websocket?.close()
    }

    function downloadCode() {
        let element = document.createElement("a")
        element.setAttribute("href", "data:text/plain;charset=utf-8,"
            + encodeURIComponent(editor.current.state.doc.toString()));
        element.setAttribute('download', "code.py")
        element.click()
    }

    return <div className={styles.parent}>
        <Navbar downloadCode={downloadCode} />
        <div className={styles.editor}>
            <div className={styles.codeMirror}>
                <div className={styles.runButton}
                onClick={() => running ? stop() : run()}>
                    {running ? "Stop" : "Run"}</div>
                <CodeMirror editorRef={editor} />
            </div>
            <div className={styles.output}>
                <Matrix update={update}></Matrix>
                <div className={styles.console}>
                    <div className={styles.consoleHeader}>
                        Console output:
                    </div>
                    <div className={styles.consoleOutput} ref={consoleRef}>
                        {consoleLines.map(line => <p>{line}</p>)}
                    </div>
                </div>
            </div>
        </div>
    </div>
}