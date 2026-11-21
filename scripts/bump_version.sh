#!/usr/bin/env bash
# Stamp style.css and app.js links in index.html with a new version so
# browsers fetch the new files instead of cached copies. Run before committing.
set -euo pipefail
cd "$(dirname "$0")/.."
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(href=\"style\.css)(\?v=[0-9]+)?\"#\1?v=$v\"#; s#(src=\"app\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#" index.html
grep -oE '(style\.css|app\.js)\?v=[0-9]+' index.html
