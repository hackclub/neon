FROM alpine:latest

RUN apk add go docker-cli

WORKDIR /root

COPY go.mod go.sum ./

RUN go mod download

COPY *.go ./

RUN go build -o neon

COPY runner ./runner

ENTRYPOINT ["/root/neon"]