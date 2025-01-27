FROM rust:1.76-alpine as builder

RUN apk add --no-cache musl-dev

WORKDIR /usr/src/neon
COPY . .

RUN cargo build --release

FROM alpine:latest

RUN apk add --no-cache docker-cli

WORKDIR /root

COPY --from=builder /usr/src/neon/target/release/neon-backend .
COPY runner ./runner

ENTRYPOINT ["/root/neon-backend"] 