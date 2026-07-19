#!/usr/bin/env python3
"""
project_deploy_template.py

Copy this file into your project as `deploy.py` (or deploy_contabo.py).
Customize the constants at the top for your project.

Usage:
  1. Build your project:  npm run build:all   (or python deploy.py --build)
  2. python deploy.py

This script contacts https://storage.noahcohn.com (your Contabo storage manager)
to upload your entire build as a single zip archive.  The server extracts it and
pushes all files over one persistent SFTP connection — much faster than uploading
files individually.

Actual FTP/SFTP credentials never leave the VPS.

Requirements:
  pip install requests
"""

import argparse
import hashlib
import io
import os
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Optional

import requests

# ============================================================
# PER-PROJECT CONFIGURATION - EDIT THESE
# ============================================================
PROJECT_NAME: str = 'tetris-webgpu'
BUILD_DIR: str = 'dist'
CONTABO_BASE_URL: str = "https://storage.noahcohn.com"
DEPLOY_FOLDER: str = ""  # override remote target folder; empty = use PROJECT_NAME

# Deploy token — read from the environment only; never hardcode secrets here.
# Set via environment: export DEPLOY_TOKEN="your_long_token_from_vps_env"
DEPLOY_TOKEN: Optional[str] = os.environ.get("DEPLOY_TOKEN")
# ============================================================

# Assets that must be present in dist/ for glass/gold block sampling to work.
REQUIRED_ASSETS = (
    'index.html',
    'block.png',
    'release.wasm',
)


def md5_file(path: Path) -> str:
    digest = hashlib.md5()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def run_build() -> bool:
    print('Running npm run build:all ...')
    try:
        subprocess.run(['npm', 'run', 'build:all'], check=True)
        return True
    except FileNotFoundError:
        print('ERROR: npm not found on PATH.')
        return False
    except subprocess.CalledProcessError as exc:
        print(f'ERROR: build failed with exit code {exc.returncode}')
        return False


def preflight(build_path: Path) -> bool:
    ok = True
    print('Preflight checks:')
    for rel in REQUIRED_ASSETS:
        asset = build_path / rel
        if not asset.is_file():
            print(f"  ✗ Missing required asset: {rel}")
            ok = False
            continue
        if rel == 'block.png':
            digest = md5_file(asset)
            print(f"  ✓ {rel} ({asset.stat().st_size / 1024:.1f} KB, md5={digest[:8]}…)")
        else:
            print(f"  ✓ {rel} ({asset.stat().st_size / 1024:.1f} KB)")
    if not DEPLOY_TOKEN:
        print('  ✗ DEPLOY_TOKEN is not set — upload will be rejected (403).')
        ok = False
    else:
        print('  ✓ DEPLOY_TOKEN is set')
    print()
    return ok


def build_zip(build_path: Path) -> bytes:
    """Zip the contents of build_path into an in-memory archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file in sorted(build_path.rglob("*")):
            if file.is_dir():
                continue
            rel = file.relative_to(build_path)
            # Skip common junk
            parts = rel.parts
            if any(p in (".git", "node_modules", "__pycache__") for p in parts):
                continue
            zf.write(file, str(rel))
            print(f"  + {rel}")
    return buf.getvalue()


def deploy_bundle(build_path: Path) -> bool:
    """Zip the build and upload it as a single bundle."""
    target_folder = DEPLOY_FOLDER or PROJECT_NAME
    url = f"{CONTABO_BASE_URL}/api/deploy/{PROJECT_NAME}/bundle"
    headers = {}
    if DEPLOY_TOKEN:
        headers["X-Deploy-Token"] = DEPLOY_TOKEN

    print("Building zip archive...")
    zip_bytes = build_zip(build_path)
    print(f"Archive size: {len(zip_bytes) / 1024:.1f} KB\n")

    print("Uploading bundle...")
    try:
        response = requests.post(
            url,
            files={"bundle": ("build.zip", zip_bytes, "application/zip")},
            data={"target_folder": target_folder},
            headers=headers,
            timeout=300,
        )
    except Exception as exc:
        print(f"  \u2717 Upload exception: {exc}")
        return False

    if response.status_code == 200:
        data = response.json()
        print(f"  \u2713 {data.get('uploaded', 0)} files uploaded")
        if data.get("failed"):
            print("  Failures:")
            for f in data["failed"]:
                print(f"    \u2717 {f['path']}: {f['error']}")
        return not data.get("failed")
    else:
        print(f"  \u2717 {response.status_code}: {response.text[:400]}")
        return False


def main():
    parser = argparse.ArgumentParser(description='Deploy Tetris WebGPU dist/ to Contabo storage.')
    parser.add_argument(
        '--build',
        action='store_true',
        help='Run npm run build:all before deploying (recommended after shader or block.png edits).',
    )
    args = parser.parse_args()

    print(f"\n=== Deploying '{PROJECT_NAME}' via Contabo -> storage.1ink.us ===\n")
    print('Note: GitHub Pages (konstantin84ukr.github.io) is a separate host — this script')
    print('only updates the Contabo mirror (e.g. test.1ink.us/tetris-webgpu/).\n')

    if args.build:
        if not run_build():
            sys.exit(1)
        print()

    build_path = Path(BUILD_DIR)
    if not build_path.exists() or not build_path.is_dir():
        print(f"ERROR: Build directory '{BUILD_DIR}/' does not exist.")
        print("Run `npm run build:all` first, or re-run with `--build`.")
        sys.exit(1)

    if not preflight(build_path):
        if not DEPLOY_TOKEN:
            print('ERROR: DEPLOY_TOKEN is required for Contabo deploy uploads.')
            print('Set it in your shell or Cloud Agent environment secrets, then retry:')
            print('  export DEPLOY_TOKEN="<token-from-vps-env>"')
            print('  python deploy.py')
        else:
            print('ERROR: Preflight failed — fix the build before deploying.')
        sys.exit(1)

    try:
        health = requests.get(f"{CONTABO_BASE_URL}/api/deploy/health", timeout=10)
        if health.status_code == 200:
            print(f"Contabo deploy service: {health.json().get('status', 'unknown')}")
    except Exception:
        print("Warning: Could not contact storage.noahcohn.com (continuing anyway).")

    print()
    success = deploy_bundle(build_path)

    print(f"\n=== {'Deployment complete' if success else 'Deployment finished with errors'} ===")
    if success:
        print('After deploy: hard-refresh the browser (Ctrl+Shift+R) — block.png is cache-busted')
        print('via ?v=<md5> in the built bundle, but HTML/JS may still be cached briefly.')
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
