from __future__ import annotations

import argparse
from pathlib import Path

from .builder import build_from_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="Build court GeoJSON from a scraper snapshot.")
    parser.add_argument("--snapshot", type=Path, required=True)
    parser.add_argument("--district-boundaries", type=Path, required=True)
    parser.add_argument("--circuit-boundaries", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, default=Path("webapp/public/sources"))
    parser.add_argument(
        "--allow-unmatched",
        action="store_true",
        help="Skip boundary features with no matching court instead of failing.",
    )
    args = parser.parse_args()
    outputs = build_from_snapshot(
        args.snapshot,
        args.district_boundaries,
        args.circuit_boundaries,
        args.output_directory,
        strict=not args.allow_unmatched,
    )
    for output in outputs:
        print(f"Wrote {output}")


if __name__ == "__main__":
    main()