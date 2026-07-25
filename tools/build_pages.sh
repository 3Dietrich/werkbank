#!/usr/bin/env bash
# build_pages.sh — baut _site fuer GitHub Pages:
#   _site/            = main-Stand (Wurzel der Pages-Seite)
#   _site/<tag>/      = eingefrorener Stand je Tag v*
# Wird vom Workflow .github/workflows/pages.yml aufgerufen (dort ist fetch-depth: 0,
# damit main und alle Tags lokal vorliegen). Lokal aufrufbar zum Testen.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf _site
mkdir -p _site

copy_tree() {
    # $1 = Quell-Ref, $2 = Zielordner
    git archive "$1" | tar -x -C "$2"
    rm -rf "$2/.github" "$2/test-results"
    find "$2" -name '.DS_Store' -delete
    find "$2" -name '*.bak' -delete
}

# main ins Root …
copy_tree main _site

# … und jeder Tag v* in seinen Unterordner.
git tag -l 'v*' | while read -r TAG; do
    mkdir -p "_site/$TAG"
    copy_tree "$TAG" "_site/$TAG"
done

echo "_site gebaut:"
ls _site
