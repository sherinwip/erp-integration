#!/usr/bin/env python3
"""
Local CLI for exercising the transform-only path against the Docker Postgres
DB, e.g.:

    python cli.py --step-pk 3 --input ../documentation/sample-payloads/salesforce-contract-award-input.json

Never sends an HTTP request -- transform_only() only reads DB config and
returns the transformed JSON body, printed to stdout.
"""
import argparse
import json
import sys

from erp_transform.orchestrator import transform_only


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local transform stage against a step's field_mapping config.")
    parser.add_argument("--step-pk", type=int, required=True)
    parser.add_argument("--input", type=str, required=True, help="Path to a JSON file with the source payload.")
    args = parser.parse_args()

    with open(args.input) as f:
        source = json.load(f)

    result = transform_only(args.step_pk, source)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
