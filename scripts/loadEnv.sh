#!/bin/bash

# Load environment variables from server .env file
export $(grep -v '^#' server/.env | xargs)

# Run the specified command
"$@"