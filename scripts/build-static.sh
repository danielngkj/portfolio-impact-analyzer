#!/bin/sh
# Package only public files. No Python or dependency installation is required.
set -eu
cd "$(dirname "$0")/.."
site_output=${1:-dist}
mkdir -p "$site_output/icons" "$site_output/data" "$site_output/case-study"
cp web/index.html web/app.js web/analyzer.js web/style.css web/review-paths.svg "$site_output/"
cp web/icons/*.svg "$site_output/icons/"
cp data/coffee-machine.json "$site_output/data/"
cp web/case-study.html "$site_output/case-study/index.html"
cp docs/portfolio-case-study.md "$site_output/case-study.md"
printf 'Static site ready in %s/\n' "$site_output"
