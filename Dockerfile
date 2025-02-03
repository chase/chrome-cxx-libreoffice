ARG ARCH=
FROM docker.io/emscripten/emsdk:3.1.73${ARCH}

RUN apt update && apt install -y git python3 curl xz-utils build-essential cmake clang-15
WORKDIR /app

# Stupid fix for missing ptrace.h in muslc includes
COPY ptrace.h /emsdk/upstream/emscripten/cache/sysroot/include/sys/
RUN chown emscripten:emscripten /emsdk/upstream/emscripten/cache/sysroot/include/sys/ptrace.h
ENV PATH="${PATH}:/app/depot_tools"
