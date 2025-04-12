#!/bin/bash

# This script builds a Docker container to regenerate the pnpm-lock.yaml file
# and copies it back to the host for Dependabot to parse correctly.

set -e

echo "Building Docker container to regenerate pnpm-lock.yaml..."
(
  cd docker && docker build -t lockfile-generator -f Dockerfile .. --target=base
)

echo "Creating temporary container..."
CONTAINER_ID=$(docker create lockfile-generator)

echo "Copying regenerated lockfile from container..."
docker cp $CONTAINER_ID:/tmp/pnpm-lock.yaml ./pnpm-lock.yaml

echo "Removing temporary container..."
docker rm $CONTAINER_ID

echo "Done! The pnpm-lock.yaml file has been updated."
