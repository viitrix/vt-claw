#!/bin/bash
# Clean store directory data
# Usage: ./clean.sh

STORE_DIR="$(cd "$(dirname "$0")" && pwd)/workspace"

if [ ! -d "${STORE_DIR}" ]; then
    echo "Store directory not found: ${STORE_DIR}"
    exit 1
fi

read -p "Remove all contents under ${STORE_DIR}? [y/N] " confirm
if [ "${confirm}" = "y" ] || [ "${confirm}" = "Y" ]; then
    rm -rf "${STORE_DIR:?}"/*
    echo "Cleaned."
else
    echo "Cancelled."
fi
