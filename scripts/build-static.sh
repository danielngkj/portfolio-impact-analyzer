#!/bin/sh
# Package public files and render the Markdown case study at build time.
set -eu
cd "$(dirname "$0")/.."
site_output=${1:-dist}
site_python=${SITE_PYTHON:-python3}
if [ -z "${SITE_PYTHON:-}" ] && [ -x .venv/bin/python ]; then
  site_python=.venv/bin/python
fi
mkdir -p "$site_output/icons" "$site_output/data" "$site_output/case-study"
cp web/index.html web/app.js web/analyzer.js web/style.css "$site_output/"
cp docs/assets/review-paths.svg "$site_output/"
cp docs/assets/lucide/*.svg docs/assets/lucide/LICENSE "$site_output/icons/"
cp data/coffee-machine.json "$site_output/data/"
"$site_python" scripts/render_case_study.py "$site_output/case-study/index.html"
cp docs/portfolio-case-study.md "$site_output/case-study.md"
printf 'Static site ready in %s/\n' "$site_output"
