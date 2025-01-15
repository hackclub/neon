import styles from "./editor.module.css"
import Navbar from "./navbar.tsx";

import {useEffect, useRef, useState} from "react";
import CodeMirror from "./codemirror.tsx";

type Color = [number, number, number];

function Matrix() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
    const [websocket, setWebsocket] = useState<WebSocket>();

    useEffect(() => {
        if (!canvasRef.current) return

        const ctx = canvasRef.current.getContext("2d");
        setCtx(ctx);

        const socket = new WebSocket("ws://localhost:8080/run");
        setWebsocket(socket)

        console.log("init")

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

        return () => socket.close()
    }, [canvasRef.current]);

    function update(matrix: Color[][]) {
        const canvas = canvasRef.current;
        if (!canvas || !ctx) return;

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
    const [code, setCode] = useState("this is a test")

    return <div className={styles.parent}>
        <Navbar />
        <div className={styles.editor}>
            <div className={styles.codeMirror}>
                <CodeMirror/>
            </div>
            <div className={styles.output}>
                <Matrix></Matrix>
            </div>
        </div>
    </div>
}