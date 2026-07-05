#!/usr/bin/env python3
"""
Minimal local-only HTTP wrapper around the transform stage, so it can be
exercised from Postman/curl exactly like the SQL RPC endpoint
(documentation/postman) already is -- gives a real request/response loop to
test against while this is still a local Flask app, and roughly mirrors the
shape an API Gateway + Lambda front door would have later (one route per
stage; transform is the only one exposed here since it's the only stage
safe to call with no side effects).

Run:
    python app.py
Then POST to http://localhost:8000/transform

This app is local-dev only -- not what ships to Step Functions. It exists
so Postman has something to hit; the actual portable logic lives in
erp_transform/.
"""
from flask import Flask, jsonify, request

from erp_transform.orchestrator import transform_only

app = Flask(__name__)


@app.post("/transform")
def transform():
    payload = request.get_json(force=True, silent=False)
    if payload is None or "step_pk" not in payload or "source" not in payload:
        return jsonify({"error": "body must be JSON with 'step_pk' (int) and 'source' (object)"}), 400

    try:
        step_pk = int(payload["step_pk"])
    except (TypeError, ValueError):
        return jsonify({"error": "'step_pk' must be an integer"}), 400

    source = payload["source"]
    if not isinstance(source, dict):
        return jsonify({"error": "'source' must be a JSON object"}), 400

    try:
        result = transform_only(step_pk, source)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"transform failed: {e}"}), 500

    return jsonify(result), 200


@app.get("/health")
def health():
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
