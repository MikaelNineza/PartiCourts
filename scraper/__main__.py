from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import collect_snapshot, write_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect and process federal court data.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("data/courts.json"),
        help="Path for the generated JSON snapshot.",
    )
    parser.add_argument(
        "--skip-retirements",
        action="store_true",
        help="Do not fetch the U.S. Courts retirement table.",
    )
    args = parser.parse_args()
    snapshot = collect_snapshot(include_retirements=not args.skip_retirements)
    write_snapshot(snapshot, args.output)
    print(f"Wrote {len(snapshot.courts)} courts to {args.output}")


if __name__ == "__main__":
    main()