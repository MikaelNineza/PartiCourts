"""AWS Lambda entry point: run the scraper and geo_builder against S3.

Reads the boundary files from S3, runs the scraper, joins the result onto
the boundaries with geo_builder, and writes the snapshot and GeoJSON back
to S3 all in memory, no local disk usage.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from typing import Any

import boto3

from geo_builder.builder import build_geojson
from scraper.pipeline import collect_snapshot

_BOUNDARIES_PREFIX = "boundaries/"
_SNAPSHOTS_PREFIX = "snapshots/"
_SOURCES_PREFIX = "sources/"


def _bucket_name() -> str:
    bucket = os.environ.get("DATA_BUCKET")
    if not bucket:
        raise RuntimeError("DATA_BUCKET environment variable is not set")
    return bucket


def _get_json(s3: Any, bucket: str, key: str) -> dict[str, Any]:
    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    return json.loads(body)


def _put_json(s3: Any, bucket: str, key: str, data: dict[str, Any]) -> None:
    body = (json.dumps(data, indent=2) + "\n").encode("utf-8")
    s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType="application/json")


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    bucket = _bucket_name()
    s3 = boto3.client("s3")

    district_boundaries = _get_json(s3, bucket, f"{_BOUNDARIES_PREFIX}dc_boundaries.geojson")
    circuit_boundaries = _get_json(s3, bucket, f"{_BOUNDARIES_PREFIX}cc_boundaries.geojson")

    snapshot_dict = collect_snapshot().to_dict()
    generated_at = snapshot_dict["generated_at"]
    courts = snapshot_dict["courts"]
    district_courts = [court for court in courts if not court.get("is_circuit")]
    circuit_courts = [court for court in courts if court.get("is_circuit")]

    district_geojson = build_geojson(district_boundaries, district_courts, "district", generated_at=generated_at)
    circuit_geojson = build_geojson(circuit_boundaries, circuit_courts, "circuit", generated_at=generated_at)

    run_date = datetime.now(UTC).strftime("%Y-%m-%d")
    _put_json(s3, bucket, f"{_SNAPSHOTS_PREFIX}courts-{run_date}.json", snapshot_dict)
    _put_json(s3, bucket, f"{_SNAPSHOTS_PREFIX}courts-latest.json", snapshot_dict)
    _put_json(s3, bucket, f"{_SOURCES_PREFIX}dc_usable.geojson", district_geojson)
    _put_json(s3, bucket, f"{_SOURCES_PREFIX}cc_usable.geojson", circuit_geojson)

    return {
        "courts": len(courts),
        "district_features": len(district_geojson["features"]),
        "circuit_features": len(circuit_geojson["features"]),
    }
