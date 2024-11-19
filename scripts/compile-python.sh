#!/bin/bash
for version in 3.9 3.10 3.11 3.12; do
  pyenv global $version
  python -m compileall server/bundled/tools/python
done
