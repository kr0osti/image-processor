#!/bin/bash

echo "Generating pnpm-lock.yaml file..."

# Remove the existing lockfile
rm -f pnpm-lock.yaml

# Generate a new lockfile
pnpm install --lockfile-only

echo "Lockfile generated successfully!"
echo "You can now commit the pnpm-lock.yaml file to your repository."
