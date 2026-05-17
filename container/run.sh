#!/bin/bash
# Run vt-claw container with source mounted for development
# Usage: ./run.sh [tag]

CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
TAG="${1:-latest}"
CONTAINER_IMAGE="vt-claw-xiaoer"
SERVER_PORT="${SERVER_PORT:-3000}"
HOST_EXT_PORT="${HOST_EXT_PORT:-4000}"

if ${CONTAINER_RUNTIME} ps -q --filter "name=${CONTAINER_IMAGE}" | grep -q .; then
    ${CONTAINER_RUNTIME} stop ${CONTAINER_IMAGE}
fi
exec ${CONTAINER_RUNTIME} run --rm -it\
    --name ${CONTAINER_IMAGE} \
    --user $(id -u):$(id -g) \
    --workdir /home/pn \
    --group-add video \
    --device /dev/video0:/dev/video79 \
    -e TZ="$(cat /etc/timezone 2>/dev/null || echo 'Asia/Shanghai')" \
    -e HOME=/home/pn \
    -e PI_DIR=/home/pn/.pi/agent \
    -e STORE_DIR=/workspace \
    -e HOST_STORE_DIR="$(pwd)/workspace" \
    -e SERVER_PORT="${SERVER_PORT}" \
    -e HOST_EXT_PORT="${HOST_EXT_PORT}" \
    --add-host host.docker.internal:host-gateway \
    -e ENABLE_AUDIO="${ENABLE_AUDIO:-false}" \
    -e AUDIO_DEVICE="${AUDIO_DEVICE:-default}" \
    -p "127.0.0.1:${SERVER_PORT}:${SERVER_PORT}" \
    -v "$(pwd)/../claw/src:/app/src:ro" \
    -v "$(pwd)/../pi:/home/pn/.pi/agent" \
    -v "$(pwd)/workspace:/workspace" \
    vt-claw:${TAG}
