#!/usr/bin/env bash
# Build the Lambda deployment zip: scraper + geo_builder + lambda_function.py.
#
# boto3 is deliberately not bundled -- every AWS-managed Python Lambda
# runtime already includes the AWS SDK. Both scraper's and geo_builder's
# dependencies are pure Python, so a plain zip works without a container image.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build/lambda"
ZIP_PATH="$ROOT_DIR/build/lambda.zip"

rm -rf "$BUILD_DIR" "$ZIP_PATH"
mkdir -p "$BUILD_DIR"

pip install --target "$BUILD_DIR" "$ROOT_DIR/scraper" "$ROOT_DIR/geo_builder"
cp "$ROOT_DIR/lambda_function.py" "$BUILD_DIR/"

# Installed metadata isn't needed at runtime and only bloats the zip.
rm -rf "$BUILD_DIR"/*.dist-info

python3 -c "
import pathlib
import zipfile

build_dir = pathlib.Path('$BUILD_DIR')
with zipfile.ZipFile('$ZIP_PATH', 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(build_dir.rglob('*')):
        if path.is_file():
            zf.write(path, path.relative_to(build_dir))
"
echo "Wrote $ZIP_PATH"
