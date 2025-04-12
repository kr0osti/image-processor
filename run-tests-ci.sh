#!/bin/bash
# Script to run tests in CI environment

# Fix the Jest configuration
node fix-jest-config.js

# Set environment variables
export NODE_ENV=test-node
export NEXT_PUBLIC_SITE_NAME="NextJS Image Processor Test"
export NEXT_PUBLIC_SITE_DESCRIPTION="Test environment for image processing"
export NEXT_PUBLIC_SITE_URL="http://localhost:3000"
export CLEANUP_API_KEY="test-api-key"

# Run the tests
npx jest --config=config/jest/jest.config.js --passWithNoTests --testEnvironment=node --detectOpenHandles --forceExit --no-cache --testTimeout=70000 --rootDir=.
