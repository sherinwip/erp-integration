from flask import Flask, request, jsonify
from datetime import datetime, timezone
import json
import os
import uuid

app = Flask(__name__)

# Oracle Fusion style resources
RESOURCES = [
    "contractAwards",
    "contractModifications",
    "contractRevenue",
    "contractActuals",
    "clins",
    "sins"
]

BASE_RESOURCE_PATH = "/fscmRestApi/resources/latest"


def get_request_payload():
    if request.is_json:
        return request.get_json(silent=True)

    raw_payload = request.get_data(as_text=True)
    return raw_payload if raw_payload else None


@app.before_request
def print_incoming_request():
    request_snapshot = {
        "method": request.method,
        "path": request.path,
        "queryParameters": request.args.to_dict(),
        "headers": dict(request.headers),
        "payload": get_request_payload()
    }

    print("=== Incoming Request ===")
    print(json.dumps(request_snapshot, indent=2, default=str))
    print("========================")


def build_response(resource, record_id=None):
    response_payload = {
        "status": "SUCCESS",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "requestId": str(uuid.uuid4()),
        "resource": resource,
        "recordId": record_id,
        "method": request.method,
        "path": request.path,
        "queryParameters": request.args.to_dict(),
        "headers": dict(request.headers),
        "payload": get_request_payload()
    }

    return jsonify(response_payload)


# Root
@app.route("/", methods=["GET"])
def home():
    return {
        "message": "Oracle Fusion Mock REST API",
        "resources": RESOURCES
    }


def register_resource_routes(resource):
    collection_path = f"{BASE_RESOURCE_PATH}/{resource}"
    single_resource_path = f"{BASE_RESOURCE_PATH}/{resource}/<record_id>"

    def create(resource_name=resource):
        return build_response(resource_name), 201

    def get(record_id, resource_name=resource):
        return build_response(resource_name, record_id)

    def update(record_id, resource_name=resource):
        return build_response(resource_name, record_id)

    def replace(record_id, resource_name=resource):
        return build_response(resource_name, record_id)

    def delete(record_id, resource_name=resource):
        return jsonify({
            "status": "SUCCESS",
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "requestId": str(uuid.uuid4()),
            "resource": resource_name,
            "method": request.method,
            "path": request.path,
            "deletedId": record_id
        })

    app.add_url_rule(
        collection_path,
        endpoint=f"{resource}_create",
        view_func=create,
        methods=["POST"]
    )

    app.add_url_rule(
        single_resource_path,
        endpoint=f"{resource}_get",
        view_func=get,
        methods=["GET"]
    )

    app.add_url_rule(
        single_resource_path,
        endpoint=f"{resource}_update",
        view_func=update,
        methods=["PATCH"]
    )

    app.add_url_rule(
        single_resource_path,
        endpoint=f"{resource}_replace",
        view_func=replace,
        methods=["PUT"]
    )

    app.add_url_rule(
        single_resource_path,
        endpoint=f"{resource}_delete",
        view_func=delete,
        methods=["DELETE"]
    )


for resource in RESOURCES:
    register_resource_routes(resource)


@app.route("/oauth2/v1/token", methods=["POST"])
def oauth_token():
    return jsonify({
        "access_token": "sample-bearer-token",
        "token_type": "bearer",
        "expires_in": 3600
    })


@app.route("/fscmRestApi/resources/11.13.18.05/contracts", methods=["POST"])
def create_contract():
    return jsonify({
        "status": "SUCCESS",
        "resource": "contracts",
        "method": request.method,
        "path": request.path,
        "payload": get_request_payload()
    }), 201


if __name__ == "__main__":
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "9010"))
    app.run(host=host, port=port, debug=False)