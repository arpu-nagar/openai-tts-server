#!/bin/bash

# Set the directory to clean
PUBLIC_DIR="/root/openai-tts-server/public"

# Remove all files in the public directory
rm -f $PUBLIC_DIR/*

# Optional: Log the cleanup
echo "Cleaned up public directory at $(date)" >> /var/log/public_cleanup.log
