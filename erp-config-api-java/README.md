# ERP Config API Java

Java conversion of the Python `erp-config-api` using JDK 21 and Spring Boot 4.0.6.

## Stack
- Java 21
- Spring Boot 4.0.6
- Spring Web + Validation + Data JPA
- PostgreSQL

## Base Endpoint
All API endpoints are under:

`/api/config`

Examples:
- `GET /api/config/health`
- `GET /api/config/clients`
- `GET /api/config/targets`
- `GET /api/config/steps`
- `GET /api/config/pipelines`
- `GET /api/config/pipeline-steps/{pipelineStepPk}`
- `GET /api/config/field-mappings`

## API Version Headers
Version is required in request headers and echoed in response headers.

- Required request header: `X-API-Version`
- Response header: `X-API-Version-Used`

Example:

```bash
curl -i \
  -H "X-API-Version: v1" \
  http://localhost:8080/api/config/clients
```

If missing header, API returns HTTP 400.

## Run
Your current machine has Java 19 active, so you must switch to JDK 21 first.

```bash
# Example after installing JDK 21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"

cd /Users/vzodge/work/technomile/erp-integration/erp-config-api-java
mvn clean spring-boot:run
```

## Environment Variables
Defaults are aligned with the Python service.

- `DB_HOST` (default `localhost`)
- `DB_PORT` (default `5432`)
- `DB_NAME` (default `erp-integration`)
- `DB_USER` (default `root`)
- `DB_PASSWORD` (default `root`)
