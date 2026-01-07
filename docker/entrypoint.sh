#!/bin/sh
set -e

# Fix permissions for mounted volumes
# This is needed when volumes are mounted from the host (especially on Windows)
if [ -d "/app/public/uploads" ]; then
    echo "Fixing permissions for /app/public/uploads..."
    # Try to fix permissions - if we're running as root, chown and chmod
    # If we're not root, try chmod anyway (might work if the mount allows it)
    if [ "$(id -u)" = "0" ]; then
        chown -R 1001:1001 /app/public/uploads 2>/dev/null || true
        chmod -R 777 /app/public/uploads 2>/dev/null || true
    else
        # Try chmod even if not root (might work depending on mount options)
        chmod -R 777 /app/public/uploads 2>/dev/null || true
    fi
    echo "Permissions fixed for /app/public/uploads"
fi

# If we're running as root, switch to the nextjs user (1001:1001)
if [ "$(id -u)" = "0" ]; then
    echo "Switching to user 1001:1001"
    # Use su-exec (installed in Dockerfile) to switch user and execute command
    exec su-exec nextjs "$@"
else
    # Already running as the correct user, execute the command directly
    exec "$@"
fi
