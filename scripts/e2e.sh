#!/usr/bin/env bash

echo "Running Client Tests..."
export CODE_TESTS_PATH="$(pwd)/client/out/test"
export CODE_TESTS_WORKSPACE="$(pwd)/client/testFixture"
node "$(pwd)/client/out/test/runTest"

# Check if the client tests passed before running the server tests
if [ $? -ne 0 ]; then
  echo "Client tests failed. Skipping server tests."
  exit 1
fi

echo "Running Server Tests..."
npm --prefix ./server run test

# Check if the server tests passed before running the Python tests
if [ $? -ne 0 ]; then
  echo "Server tests failed."
  exit 1
fi

echo "Running Python Tests..."
# Navigate to the Python root directory before running the Python tests
cd "$(pwd)/server/bundled/tools/python"
python -m unittest discover -s tests

if [ $? -ne 0 ]; then
  echo "Python tests failed."
  exit 1
fi

echo "All tests passed."
