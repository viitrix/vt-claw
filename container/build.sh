#!/bin/bash
# Build pi container images
# Usage: ./build.sh <base|agent> [tag]

set -e

CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
BUILD_TYPE="${1:-}"
TAG="${2:-latest}"

show_usage() {
    echo "Usage: $0 <base|agent> [tag]"
    echo "  base   - Build vt-claw-base image"
    echo "  agent  - Build vt-claw-agent image"
    echo "  tag    - Image tag (default: latest)"
    exit 1
}

case "$BUILD_TYPE" in
    base)
        IMAGE_NAME="vt-claw-base"
        DOCKERFILE="Dockerfile.base"
        BUILD_CONTEXT="."
        ;;
    agent)
        rm -rf ../agent/node_modules
        IMAGE_NAME="vt-claw-agent"
        DOCKERFILE="Dockerfile.agent"
        BUILD_CONTEXT=".."
        ;;
    *)
        echo "Error: Invalid build type '$BUILD_TYPE'"
        show_usage
        ;;
esac

echo "Building pi-${BUILD_TYPE} container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"
echo "Dockerfile: ${DOCKERFILE}"
echo ""

${CONTAINER_RUNTIME} build --network=host -t "${IMAGE_NAME}:${TAG}" -f "${DOCKERFILE}" "${BUILD_CONTEXT}"
