#!/bin/bash

# Create uploads directory if it doesn't exist
mkdir -p ./public/uploads

# Set permissions for the uploads directory
chmod -R 777 ./public/uploads

echo "Permissions for uploads directory have been set correctly."
echo "You can now run 'docker compose up' to start the application."