#!/usr/bin/env python3
"""
Local CLI for exercising the transform stage against the Docker Postgres DB.

By pipeline_id (what a real caller like CRM/Salesforce knows), runs every
attached step in seq order:

    python cli.py --pipeline-id award-to-oracle-contract-full-v1 --input ../documentation/sample-payloads/salesforce-contract-award-input.json

By step_pk (direct step-level debugging):

    python cli.py --step-pk 3 --input ../documentation/sample-payloads/salesforce-contract-award-input.json

Never sends an HTTP request -- only reads DB config and prints the
transformed JSON body to stdout.
"""
import argparse
import json
import sys

from erp_transform.orchestrator import transform_only, transform_pipeline


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the local transform stage against a pipeline's or step's field_mapping config.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pipeline-id", type=str, help="Pipeline identifier (what a CRM caller actually knows).")
    group.add_argument("--step-pk", type=int, help="Internal step primary key (debugging a single step).")
    parser.add_argument("--input", type=str, required=True, help="Path to a JSON file with the source payload.")
    args = parser.parse_args()

    with open(args.input) as f:
        source = json.load(f)

    if args.pipeline_id:
        result = transform_pipeline(args.pipeline_id, source)
    else:
        result = transform_only(args.step_pk, source)

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
