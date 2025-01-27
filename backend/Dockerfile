ARG LANGUAGE=rust

FROM alpine:latest AS builder-go
ARG LANGUAGE
RUN if [ "$LANGUAGE" != "go" ]; then exit 1; fi
RUN apk add --no-cache go docker-cli
WORKDIR /usr/src/neon
COPY backend/go/go.mod backend/go/go.sum ./backend/go/
RUN cd backend/go && go mod download
COPY backend/go/. ./backend/go/
RUN cd backend/go && go build -o neon-go

FROM rust:1.76-alpine AS builder-rust
ARG LANGUAGE
RUN if [ "$LANGUAGE" != "rust" ]; then exit 1; fi
RUN apk add --no-cache musl-dev
WORKDIR /usr/src/neon
COPY backend/rust/Cargo.toml backend/rust/Cargo.lock ./
RUN mkdir src && echo "fn main() { println!(\"Hello from Rust\"); }" > src/main.rs
RUN cargo build --release
COPY backend/rust/. ./backend/rust/
RUN cargo build --release

FROM alpine:latest
RUN apk add --no-cache docker-cli
WORKDIR /root

ARG LANGUAGE
COPY --from=builder-go /usr/src/neon/backend/go/neon-go ./neon
COPY --from=builder-rust /usr/src/neon/backend/rust/target/release/neon-backend ./neon-backend

COPY runner ./runner

# Set the entrypoint based on the language
CMD sh -c "if [ '$LANGUAGE' = 'go' ]; then ./neon; else ./neon-backend; fi"