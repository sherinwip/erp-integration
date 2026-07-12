#!/bin/sh

echo "Creating Oracle Fusion Basic Auth secret..."

awslocal secretsmanager create-secret \
  --name oracle-ewnj-test-creds-demo \
  --secret-string file:///etc/localstack/init/oracle-ewnj-test-creds-demo.json

echo "Secret created successfully."