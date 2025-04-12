#!/bin/sh

# Function to run cleanup
run_cleanup() {
  echo "Running cleanup at $(date)"
  RESPONSE=$(curl -s -w "\n%{http_code}" "http://app:3000/api/cleanup?key=$CLEANUP_API_KEY")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed "$d")
  
  if [ "$HTTP_CODE" = "200" ]; then
    echo "Cleanup successful: $BODY"
  else
    echo "Cleanup failed with status $HTTP_CODE: $BODY"
  fi
}

# Main loop
while true; do
  run_cleanup
  echo "Sleeping for 60 seconds..."
  sleep 60
done
