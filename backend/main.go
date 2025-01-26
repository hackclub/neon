//go:build linux
// +build linux

package main

import (
	"bufio"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	"github.com/gorilla/websocket"
)

func main() {
	http.HandleFunc("/run", runProgram)
	http.HandleFunc("/", func(res http.ResponseWriter, req *http.Request) {
		fmt.Fprint(res, "hello, world!")
	})
	log.Println("8080")

	buildRunner()

	log.Fatal(http.ListenAndServe("0.0.0.0:8080", nil))
}

func buildRunner() {
	cmd := exec.Command("docker", "build", "./runner", "--tag=neon")
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout
	err := cmd.Run()
	if err != nil {
		log.Fatal(err)
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func createContainer(code string, shmem string) {
	cmd := exec.Command("docker", "create", "--name", shmem,
		"--mount", "type=bind,src=/dev/shm/neon/"+shmem+",dst=/dev/shm/neon",
		"neon", "-u", "-c", "import neon_wrappers; "+code)

	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	cmd.Run()
}

func spawnProcess(shmem string) (out chan string, in io.WriteCloser, kill func() error, err error) {

	neonCmd := exec.Command("docker", "start", "-ai", shmem)

	//in, err = neonCmd.StdinPipe()
	//if err != nil {
	//	return
	//}

	neonOutPipe, err := neonCmd.StdoutPipe()
	if err != nil {
		return
	}

	neonCmd.Stderr = neonCmd.Stdout

	out = make(chan string)

	neonCmd.Start()

	go func() {
		reader := bufio.NewReader(neonOutPipe)
		for {
			line, err := reader.ReadString('\n')
			fmt.Print(line)
			if err != nil {
				fmt.Println(err)
				fmt.Println(neonCmd.ProcessState)
				break
			}

			out <- line
		}
		out <- ""
	}()

	fmt.Println("about to start!")
	kill = func() (err error) {
		fmt.Println(neonCmd.Process.Pid)
		err = neonCmd.Process.Kill()
		neonCmd.Process.Wait()
		exec.Command("docker", "kill", shmem).Run()
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
	file, err := os.Create("/dev/shm/neon/" + shmem)
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
					time.Sleep(time.Microsecond * 100)
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

func loadFile(filename string, data []byte, containerName string) {
	f, err := os.CreateTemp("", "neon")
	if err != nil {
		fmt.Println(err)
		return
	}
	defer f.Close()
	defer os.Remove(f.Name())

	f.Write(data)

	cmd := exec.Command("docker", "cp", f.Name(), containerName+":/root/"+filename)

	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout

	cmd.Run()
}

var shmemFiles = map[int]bool{}
var shmemFilesLock = sync.Mutex{}

func runProgram(w http.ResponseWriter, r *http.Request) {
	fileNames := r.URL.Query()["filename"]
	fmt.Println(fileNames)

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

	shmemFilesLock.Lock()
	var i int
	for i = rand.Int(); shmemFiles[i] == true; {
	}
	shmem := "neon." + strconv.Itoa(i)
	shmemFilesLock.Unlock()

	matrix, quit, err := initMatrix(shmem)
	if err != nil {
		log.Println("init:", err)
		return
	}
	defer func() {
		quit <- struct{}{}
	}()

	code := string(<-incomingMessages)

	createContainer(code, shmem)

	for i := range fileNames {
		msg := <-incomingMessages

		loadFile(fileNames[i], msg, shmem)
	}

	out, in, kill, err := spawnProcess(shmem)
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
			if message == "" {
				return
			}
			err := c.WriteMessage(websocket.TextMessage, []byte(message))
			if err != nil {
				return
			}
		case matrix := <-matrix:
			//log.Println("received matrix:", (*matrix)[0])
			err := c.WriteMessage(websocket.BinaryMessage, *matrix)
			if err != nil {
				return
			}
		}
	}
}
