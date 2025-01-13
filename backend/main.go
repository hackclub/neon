package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

func main() {
	http.HandleFunc("/run", runProgram)
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func spawnProcess(code string, shmem string) (out chan []byte, in io.WriteCloser, kill func() error, err error) {
	neonCmd := exec.Command("docker", "exec")

	in, err = neonCmd.StdinPipe()
	if err != nil {
		return
	}

	neonOutPipe, err := neonCmd.StdoutPipe()
	if err != nil {
		return
	}

	out = make(chan []byte)

	go func() {
		outBuf := make([]byte, 1024)
		for {
			n, err := neonOutPipe.Read(outBuf)
			if err != nil {
				log.Println("read:", err)
				break
			}
			out <- outBuf[:n]
		}
	}()

	neonCmd.Start()
	kill = neonCmd.Process.Kill

	return
}

type Color struct {
	R, G, B, A uint8
}

type Shmem struct {
	Lock   *uint32
	Matrix []Color
	file   *os.File
}

func (s *Shmem) Close() error {
	return s.file.Close()
}

const shmemSize = 4*32*64 + 4

func createShmem(shmem string) (s Shmem, err error) {
	if !strings.HasPrefix(shmem, "/") {
		shmem = "/" + shmem
	}

	name, err := syscall.BytePtrFromString(shmem)
	if err != nil {
		fmt.Println("ack")
		return
	}

	flags := os.O_RDWR | os.O_CREATE
	perms := 0600

	fd, _, _ := syscall.Syscall(syscall.SYS_SHM_OPEN,
		uintptr(unsafe.Pointer(name)),
		uintptr(flags), uintptr(perms))

	file := os.NewFile(fd, shmem)
	if file == nil {
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

	s.Matrix = (*[shmemSize]Color)(unsafe.Pointer(&data[4]))[:]
	s.Lock = (*uint32)(unsafe.Pointer(&data[0]))
	s.file = file

	return
}

func initMatrix(shmem string) (matrix chan *[]Color, quit chan struct{}, err error) {
	matrix = make(chan *[]Color)
	s, err := createShmem(shmem)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer s.Close()

	ticker := time.NewTicker(1000 / 60 * time.Millisecond)
	quit = make(chan struct{})

	go func() {
		for {
			select {
			case <-ticker.C:
				tempMatrix := make([]Color, 64*32)

				for !atomic.CompareAndSwapUint32(s.Lock, 0, 1) {
					time.Sleep(time.Millisecond)
				}
				copy(tempMatrix, s.Matrix)
				atomic.StoreUint32(s.Lock, 0)

				matrix <- &tempMatrix

			case <-quit:
				ticker.Stop()
				return
			}
		}
	}()

	return
}

func runProgram(w http.ResponseWriter, r *http.Request) {
	code, err := io.ReadAll(r.Body)
	if err != nil {
		log.Println("read:", err)
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
				log.Println("read:", err)
				break
			}
			incomingMessages <- message
		}
	}()

	matrix, quit, err := initMatrix("nedfdsdfson")
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

	for {
		select {
		case message := <-incomingMessages:
			log.Println("received message:", string(message))
			in.Write(message)
		case message := <-out:
			log.Println("received message:", string(message))
		case matrix := <-matrix:
			log.Println("received matrix:", matrix)
		}
	}
}
