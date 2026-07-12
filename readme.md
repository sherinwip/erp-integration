# ERP Integration Project Setup

This document provides step-by-step commands to set up and run the full local project.

## 1. Go to project root

```bash
cd {PROJECT_PATH}/erp-integration
```

## 2. Build Docker image from `database` folder

```bash
cd {PROJECT_PATH}/erp-integration/database
docker build -t erp-integration .
```

## 3. Run Docker DB image

```bash
docker run -d \
    --name erp-integration \
    -e POSTGRES_DB=erp-integration \
    -e POSTGRES_USER=root \
    -e POSTGRES_PASSWORD=root \
    -p 5432:5432 \
    erp-integration
```

## 4. Run mock contract API

Open a new terminal and run:

```bash
cd {PROJECT_PATH}/erp-integration/mock-oracle-fusion/contract
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 9010 --reload
```

## 5. Run docker compose for local-stack

Open a new terminal and run:

```bash
cd {PROJECT_PATH}/erp-integration/mock-oracle-fusion/local-stack
docker compose up -d
```

Optional health check:

```bash
curl http://localhost:4566/_localstack/health
```

## 6. Start config-api

Open a new terminal and run:

```bash
cd {PROJECT_PATH}/erp-integration/erp-config-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8010
```

## 7. Start config-portal

Open a new terminal and run:

```bash
cd {PROJECT_PATH}/erp-integration/erp-config-portal
npm install
npm run dev
```

## 8. Start transformation-svc

Open a new terminal and run:

```bash
cd {PROJECT_PATH}/erp-integration/transformation-svc
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python app.py
```

Alternative run command:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## 9. Load Postman collection

Import this collection in Postman:

`{PROJECT_PATH}/erp-integration/documentation/postman/response-extraction-demo.postman_collection.json`

Postman steps:

1. Open Postman.
2. Click **Import**.
3. Choose **Upload Files**.
4. Select `response-extraction-demo.postman_collection.json` from the path above.
5. Click **Import**.

## 10. Quick startup order

Use this order every time:

1. DB container (`erp-integration`)
2. Mock contract API
3. LocalStack (`docker compose up -d`)
4. `erp-config-api`
5. `erp-config-portal`
6. `transformation-svc`
