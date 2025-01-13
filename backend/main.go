package main

import (
	"github.com/gorilla/websocket"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/run", runProgram)
	log.Fatal(http.ListenAndServe("localhost:8080", nil))
}

var upgrader = websocket.Upgrader{}

func runProgram(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()

	select {}
}
