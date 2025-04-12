#!/bin/bash
# Script to run the fixed tests

# Copy the updated test file into the container
docker cp __tests__/api/images.test.js nextjs-image-processor-dev:/app/__tests__/api/images.test.js

# Run the tests
docker exec -it nextjs-image-processor-dev sh -c "cd /app && NODE_ENV=test-node npx jest __tests__/api/images.test.js --testEnvironment=node --detectOpenHandles --forceExit"
