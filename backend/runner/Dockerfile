FROM alpine

RUN apk add python3 gcc python3-dev musl-dev

WORKDIR /root

COPY  requirements.txt ./

RUN python3 -m venv venv

RUN venv/bin/pip install -r requirements.txt

COPY neon_wrappers.py framebufferio.py ./

ENV BLINKA_OS_AGNOSTIC true

ENTRYPOINT ["venv/bin/python3"]