ARG LANGUAGE=rust

FROM alpine:latest AS base
RUN apk add --no-cache go docker-cli musl-dev rust cargo
WORKDIR /usr/src/neon

FROM base AS builder-go
COPY go/ ./go/
RUN cd go && \
    go mod download && \
    go build -o neon-go

FROM base AS builder-rust
COPY rust/ ./rust/
RUN cd rust && \
    cargo build --release

FROM alpine:latest
RUN apk add --no-cache docker-cli
WORKDIR /root

RUN echo '#!/bin/sh\n\
if [ "$LANGUAGE" = "go" ] && [ -f /root/neon ]; then\n\
    exec /root/neon\n\
elif [ -f /root/neon-backend ]; then\n\
    exec /root/neon-backend\n\
else\n\
    echo "No valid binary found"\n\
    exit 1\n\
fi' > /root/run.sh && chmod +x /root/run.sh

ARG LANGUAGE

COPY --from=builder-go /usr/src/neon/go/neon-go /root/neon
COPY --from=builder-rust /usr/src/neon/rust/target/release/neon-backend /root/neon-backend

CMD ["/root/run.sh"]