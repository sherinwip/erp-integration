# Mock Oracle Fusion Service

## Default Port

The service runs on port 9010 by default.

## Run

From this folder, run:

```bash
python3 app.py
```

You can override the port with the PORT environment variable:

```bash
PORT=9080 python3 app.py
```

## Request Logging

Every incoming request is printed in the terminal with:

- method
- path
- query parameters
- headers
- payload

## Testing with Postman Collection

Use OracleFusionMock.postman_collection.json after starting the service.
