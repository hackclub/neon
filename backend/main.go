//go:build linux
// +build linux

package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

func main() {
	http.HandleFunc("/run", runProgram)
	log.Println("8080")
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func spawnProcess(code string, shmem string) (out chan []byte, in io.WriteCloser, kill func() error, err error) {
	cwd, err := os.Getwd()
	if err != nil {
		return
	}

	neonCmd := exec.Command(cwd+"/venv/bin/python3", "blinka_displayio_shmem.py")

	//in, err = neonCmd.StdinPipe()
	//if err != nil {
	//	return
	//}

	/*	neonOutPipe, err := neonCmd.StdoutPipe()
		if err != nil {
			return
		}*/

	neonErrPipe, err := neonCmd.StderrPipe()
	if err != nil {
		return
	}

	out = make(chan []byte)

	go func() {
		outBuf := make([]byte, 1024*20)
		for {
			/*			n, err := neonOutPipe.Read(outBuf)
						fmt.Println(n)
						if err != nil {
							log.Println("read1:", err)
							break
						}

						out <- outBuf[:n]*/

			er, err := neonErrPipe.Read(outBuf)
			fmt.Println(er)
			if err != nil {
				log.Println("read1:", err)
				break
			}

			out <- outBuf[:er]
		}
		out <- nil
	}()

	fmt.Println("about to start!")
	neonCmd.Start()
	kill = func() (err error) {
		fmt.Println(neonCmd.Process.Pid)
		err = neonCmd.Process.Kill()
		neonCmd.Process.Wait()
		return
	}

	return
}

type Shmem struct {
	Lock   *uint32
	Matrix []byte
	file   *os.File
}

func (s *Shmem) Unlink() error {
	return os.Remove(s.file.Name())
}

const shmemSize = 4*32*64 + 4

func createShmem(shmem string) (s Shmem, err error) {
	file, err := os.Create("/dev/shm/" + shmem)
	if err != nil {
		fmt.Println("ack2")
		return
	}

	err = file.Truncate(int64(shmemSize))
	if err != nil {
		fmt.Println("ack3")
		return
	}

	data, err := syscall.Mmap(
		int(file.Fd()),
		0,
		shmemSize,
		syscall.PROT_READ|syscall.PROT_WRITE,
		syscall.MAP_SHARED,
	)
	if err != nil {
		return
	}

	s.Matrix = (*[shmemSize]byte)(unsafe.Pointer(&data[4]))[:]
	s.Lock = (*uint32)(unsafe.Pointer(&data[0]))
	s.file = file

	return
}

func initMatrix(shmem string) (matrix chan *[]byte, quit chan struct{}, err error) {
	matrix = make(chan *[]byte)
	s, err := createShmem(shmem)
	if err != nil {
		fmt.Println(err)
		return
	}

	ticker := time.NewTicker(1000 / 30 * time.Millisecond)
	quit = make(chan struct{})

	go func() {
		for {
			select {
			case <-ticker.C:
				tempMatrix := make([]byte, 64*32*4)

				for !atomic.CompareAndSwapUint32(s.Lock, 0, 1) {
					time.Sleep(time.Millisecond)
				}
				copy(tempMatrix, s.Matrix)
				atomic.StoreUint32(s.Lock, 0)

				matrix <- &tempMatrix

			case <-quit:
				ticker.Stop()
				s.Unlink()
				return
			}
		}
	}()

	return
}

func runProgram(w http.ResponseWriter, r *http.Request) {
	code, err := io.ReadAll(r.Body)
	if err != nil {
		log.Println("read2:", err)
		return
	}

	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()

	incomingMessages := make(chan []byte)

	go func() {
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				log.Println("read3:", err)
				break
			}
			incomingMessages <- message
		}
		incomingMessages <- nil
	}()

	matrix, quit, err := initMatrix("neon")
	if err != nil {
		log.Println("init:", err)
		return
	}
	defer func() {
		quit <- struct{}{}
	}()

	out, in, kill, err := spawnProcess(string(code), "neon") // TODO: shmem names
	if err != nil {
		log.Println("spawn:", err)
		return
	}
	defer kill()

	fmt.Println("------------ NEW --------------")
	defer fmt.Println("------------ CLOSING CHANNEL! -------------")

	for {
		select {
		case message := <-incomingMessages:
			if message == nil {
				return
			}
			fmt.Println(string(message))
			in.Write(message)
		case message := <-out:
			if message == nil {
				return
			}
			log.Println("received message:", string(message))
		case matrix := <-matrix:
			//log.Println("received matrix:", (*matrix)[0])
			err := c.WriteMessage(websocket.BinaryMessage, *matrix)
			if err != nil {
				return
			}
		}
	}
}
