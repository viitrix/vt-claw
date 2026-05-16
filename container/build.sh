#!/bin/bash
# Build pi container images
# Usage: ./build.sh <base|agent> [tag]

set -e

CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
IMAGE_NAME="vt-claw"
TAG="latest"
DOCKERFILE="Dockerfile"
BUILD_CONTEXT=".."
        
echo "Building vt-claw container image..."
echo "Image: ${IMAGE_NAME}:${TAG}"
echo "Dockerfile: ${DOCKERFILE}"
echo ""

${CONTAINER_RUNTIME} build --network=host -t "${IMAGE_NAME}:${TAG}" -f "${DOCKERFILE}" "${BUILD_CONTEXT}"
