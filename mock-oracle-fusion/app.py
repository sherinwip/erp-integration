from flask import Flask, request, jsonify
from datetime import datetime
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


def build_response(resource, record_id=None):
    return jsonify({
        "status": "SUCCESS",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "requestId": str(uuid.uuid4()),
        "resource": resource,
        "method": request.method,
        "path": request.path,
        "queryParameters": request.args.to_dict(),
        "headers": {
            "Content-Type": request.headers.get("Content-Type"),
            "Authorization": request.headers.get("Authorization")
        },
        "payload": request.get_json(silent=True)
    })


# Root
@app.route("/")
def home():
    return {
        "message": "Oracle Fusion Mock REST API",
        "resources": RESOURCES
    }


# Dynamically create routes
for resource in RESOURCES:

    # POST
    def create(resource=resource):
        return build_response(resource), 201

    app.add_url_rule(
        f"/fscmRestApi/resources/latest/{resource}",
        endpoint=f"{resource}_create",
        view_func=create,
        methods=["POST"]
    )

    # GET
    def get(recordId, resource=resource):
        return build_response(resource, recordId)

    app.add_url_rule(
        f"/fscmRestApi/resources/latest/{resource}/<recordId>",
        endpoint=f"{resource}_get",
        view_func=get,
        methods=["GET"]
    )

    # PATCH
    def update(recordId, resource=resource):
        return build_response(resource, recordId)

    app.add_url_rule(
        f"/fscmRestApi/resources/latest/{resource}/<recordId>",
        endpoint=f"{resource}_update",
        view_func=update,
        methods=["PATCH"]
    )

    # PUT
    def replace(recordId, resource=resource):
        return build_response(resource, recordId)

    app.add_url_rule(
        f"/fscmRestApi/resources/latest/{resource}/<recordId>",
        endpoint=f"{resource}_replace",
        view_func=replace,
        methods=["PUT"]
    )

    # DELETE
    def delete(recordId, resource=resource):
        return jsonify({
            "status": "SUCCESS",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "requestId": str(uuid.uuid4()),
            "resource": resource,
            "method": request.method,
            "path": request.path,
            "deletedId": recordId
        })

    app.add_url_rule(
        f"/fscmRestApi/resources/latest/{resource}/<recordId>",
        endpoint=f"{resource}_delete",
        view_func=delete,
        methods=["DELETE"]
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=9080, debug=True)