# MCP Server (Docker)

MCP (Model Context Protocol) サーバーの Docker コンテナです。

## ビルドと起動

```bash
finch build -t mcp-server .
```

デフォルトのリッスンポートは 8000 です。環境変数 `MCP_PORT` で変更できます。

```bash
# ローカル起動（デフォルト: 8000）
finch run -d --name mcp-server -p 8000:8000 mcp-server

# ECS 用（ポート 80）
finch run -d --name mcp-server -p 80:80 -e MCP_PORT=80 mcp-server
```

### 停止と削除

Finch では `-d` と `--rm` を併用できないため、停止後に手動で削除してください。
削除しないとポートフォワーディングが残ることがあります。

```bash
finch stop mcp-server
finch rm mcp-server
```

### curl での使い方（ローカル）

このサーバーは `stateless_http=True` で動作しているため、`initialize` のハンドシェイクなしで直接メソッドを呼び出せます。

```bash
curl -s -X POST "http://127.0.0.1:8000/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}'
```

```bash
curl -s -X POST "http://127.0.0.1:8000/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": { "name": "add_numbers", "arguments": { "a": 3, "b": 5 } },
    "id": 3
  }'
```

## Docker Hub への push（マルチプラットフォーム）

Finch では `--push` やマニフェストが使えないため、アーキテクチャごとにビルド・push します。

```bash
# AMD64
finch build --platform linux/amd64 -t toshihirock/python-simple-mcp:amd64 .
finch push toshihirock/python-simple-mcp:amd64

# ARM64
finch build --platform linux/arm64 -t toshihirock/python-simple-mcp:arm64 .
finch push toshihirock/python-simple-mcp:arm64
```

### ECS での利用

ECS タスク定義の `image` にアーキテクチャに合ったタグを指定してください。
ポート 80 で受け付ける場合は、タスク定義の `environment` に `MCP_PORT=80` を設定します。

| Fargate CPU アーキテクチャ | イメージ |
|---|---|
| X86_64 | `toshihirock/python-simple-mcp:amd64` |
| ARM64 | `toshihirock/python-simple-mcp:arm64` |

### ECS での利用（CDK）

VPC + ALB + Fargate を CDK でデプロイできます。VPC は別スタックなので他のリソースと共有可能です。
デフォルトは Public ALB ですが、`-c publicAlb=false` で Internal ALB に変更できます。
**この方法でデプロイした MCP サーバーは認証機能はないです**

```bash
cd cdk
npm install

# Public ALB（デフォルト）
CDK_DOCKER=finch npx cdk deploy McpVpcStack McpEcsStack --require-approval never

# Internal ALB
CDK_DOCKER=finch npx cdk deploy McpVpcStack McpEcsStack --require-approval never -c publicAlb=false
```

デプロイ後の確認:

```bash
MCP_ENDPOINT=$(aws cloudformation describe-stacks --stack-name McpEcsStack \
  --query 'Stacks[0].Outputs[?OutputKey==`McpEndpoint`].OutputValue' --output text)

curl -s -X POST "$MCP_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}'
```

Internal ALB の場合は、同じ VPC 内からアクセスする必要があります。CloudShell VPC 環境が手軽です:

1. マネコンで CloudShell を開く
2. Actions → VPC environment を選択
3. McpVpcStack の VPC とプライベートサブネットを指定して作成
4. 上記の curl コマンドを実行

削除:

```bash
cd cdk
npx cdk destroy McpEcsStack McpVpcStack
```

### ECS + API Key 認証での利用（CDK）

API Gateway (REST API) + API Key + NLB + Fargate の構成です。VPC スタックを共有します。

```bash
cd cdk
npm install
CDK_DOCKER=finch npx cdk deploy McpVpcStack McpEcsApiKeyStack --require-approval never
```

デプロイ後、API Key を取得:

```bash
API_KEY_ID=$(aws cloudformation describe-stacks --stack-name McpEcsApiKeyStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiKeyId`].OutputValue' --output text)
API_KEY=$(aws apigateway get-api-key --api-key "$API_KEY_ID" --include-value --query 'value' --output text)
MCP_ENDPOINT=$(aws cloudformation describe-stacks --stack-name McpEcsApiKeyStack \
  --query 'Stacks[0].Outputs[?OutputKey==`McpEndpoint`].OutputValue' --output text)
```

API Key ありで接続テスト:

```bash
curl -s -X POST "$MCP_ENDPOINT" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 1}'
```

API Key なしだと `{"message":"Forbidden"}` が返ります。
API Gateway のアクセスログは CloudWatch Logs の `/aws/apigateway/mcp-server-access` に出力されます。

削除:

```bash
cd cdk
npx cdk destroy McpEcsApiKeyStack McpVpcStack
```

## Bedrock AgentCore へのデプロイ（CDK）

CDK で Cognito + AgentCore Runtime を一括デプロイできます。
デフォルトは PUBLIC ネットワークですが、`-c agentCoreVpc=true` で VPC 内にデプロイできます。

```bash
cd cdk
npm install

# Public（デフォルト）
CDK_DOCKER=finch npx cdk deploy PythonSimpleMcpStack --require-approval never

# VPC 内にデプロイ（McpVpcStack も必要）
CDK_DOCKER=finch npx cdk deploy McpVpcStack PythonSimpleMcpStack --require-approval never -c agentCoreVpc=true
```

Docker を使う場合は `CDK_DOCKER=finch` を省略してください。

デプロイ後、CloudFormation Outputs から接続情報を取得:

```bash
export COGNITO_TOKEN_ENDPOINT=$(aws cloudformation describe-stacks --stack-name PythonSimpleMcpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoTokenEndpoint`].OutputValue' --output text)
export COGNITO_CLIENT_ID=$(aws cloudformation describe-stacks --stack-name PythonSimpleMcpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' --output text)
export COGNITO_USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name PythonSimpleMcpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text)
export COGNITO_CLIENT_SECRET=$(aws cognito-idp describe-user-pool-client \
  --user-pool-id "$COGNITO_USER_POOL_ID" --client-id "$COGNITO_CLIENT_ID" \
  --query 'UserPoolClient.ClientSecret' --output text)
export RUNTIME_ARN=$(aws cloudformation describe-stacks --stack-name PythonSimpleMcpStack \
  --query 'Stacks[0].Outputs[?OutputKey==`RuntimeArn`].OutputValue' --output text)
```

トークン取得と接続テスト:

```bash
TOKEN=$(curl -s -X POST "$COGNITO_TOKEN_ENDPOINT" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$COGNITO_CLIENT_ID&client_secret=$COGNITO_CLIENT_SECRET&scope=mcp-api/access" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

ENCODED_ARN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$RUNTIME_ARN', safe=''))")

npx @modelcontextprotocol/inspector --cli \
  "https://bedrock-agentcore.$(aws configure get region).amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT" \
  --transport http \
  --header "Authorization: Bearer $TOKEN" \
  --method tools/list
```

curl で接続する場合:

```bash
curl -s -N -X POST "https://bedrock-agentcore.$(aws configure get region).amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}'
```

削除:

```bash
cd cdk
npx cdk destroy PythonSimpleMcpStack
```

### DevOps Agent との接続設定

デプロイした AgentCore Runtime を AWS DevOps Agent の MCP サーバーとして接続できます。

1. 接続情報の取得（「デプロイ後、CloudFormation Outputs から接続情報を取得」の環境変数が設定済みの前提）

```bash
ENCODED_ARN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${RUNTIME_ARN}', safe=''))")
ENDPOINT="https://bedrock-agentcore.$(aws configure get region).amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT"

echo "Endpoint URL:  $ENDPOINT"
echo "Client ID:     $COGNITO_CLIENT_ID"
echo "Client Secret: $COGNITO_CLIENT_SECRET"
echo "Exchange URL:  $COGNITO_TOKEN_ENDPOINT"
```

2. DevOps Agent コンソールで MCP サーバーを追加

- DevOps Agent コンソールで対象の AgentSpace を選択
- 「MCP servers」タブを開き「Add MCP server」をクリック
- 以下の値を入力:

| 設定 | 値 |
|---|---|
| Endpoint URL | 上記コマンドで表示された Endpoint URL |
| Flow | OAuth Client Credentials |
| Client ID | 上記の Client ID |
| Client Secret | 上記の Client Secret |
| Exchange URL | 上記の Exchange URL |

- 「Save」をクリック

VPC 内にデプロイした場合（`-c agentCoreVpc=true`）は、DevOps Agent の AgentSpace から VPC 内の AgentCore Runtime にアクセスできます。

## Bedrock AgentCore へのデプロイ（CLI）

### 1. ECR に ARM64 イメージを push

AgentCore Runtime は ARM64 コンテナが必須です。

```bash
finch build --platform linux/arm64 -t <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<REPO>:latest .

aws ecr get-login-password --region <REGION> | finch login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com

finch push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<REPO>:latest
```

### 2. Cognito User Pool のセットアップ

#### User Pool とドメインの作成

```bash
POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name "mcp-user-pool" \
  --policies '{"PasswordPolicy":{"MinimumLength":8}}' \
  --region <REGION> --query 'UserPool.Id' --output text)

aws cognito-idp create-user-pool-domain \
  --domain "mcp-<ACCOUNT_ID>" \
  --user-pool-id $POOL_ID \
  --region <REGION>
```

#### リソースサーバーの作成（client_credentials フロー用）

```bash
aws cognito-idp create-resource-server \
  --user-pool-id $POOL_ID \
  --identifier "mcp-api" \
  --name "mcp-api" \
  --scopes ScopeName=access,ScopeDescription="MCP API access" \
  --region <REGION>
```

#### クライアントの作成

2 種類のクライアントを作成できます。

client_credentials フロー（M2M、スクリプト向け）:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name "mcp-m2m-client" \
  --generate-secret \
  --allowed-o-auth-flows "client_credentials" \
  --allowed-o-auth-scopes "mcp-api/access" \
  --allowed-o-auth-flows-user-pool-client \
  --supported-identity-providers "COGNITO" \
  --region <REGION>
```

USER_PASSWORD_AUTH フロー（ユーザー認証向け）:

```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name "mcp-user-client" \
  --no-generate-secret \
  --explicit-auth-flows "ALLOW_USER_PASSWORD_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" \
  --region <REGION>
```

USER_PASSWORD_AUTH を使う場合はユーザーも作成:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID --username testuser \
  --region <REGION> --message-action SUPPRESS

aws cognito-idp admin-set-user-password \
  --user-pool-id $POOL_ID --username testuser \
  --password 'YourPassword123!' --permanent \
  --region <REGION>
```

### 3. AgentCore Runtime の作成

`allowedClients` に使用するクライアント ID を指定します。
両方のフローを使う場合は両方のクライアント ID を含めてください。
`allowedScopes` を指定すると USER_PASSWORD_AUTH のトークン（scope が `aws.cognito.signin.user.admin`）が拒否されるため、両方対応する場合は省略します。

```bash
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name my_mcp_server \
  --region <REGION> \
  --agent-runtime-artifact '{"containerConfiguration":{"containerUri":"<ECR_IMAGE_URI>"}}' \
  --role-arn "<EXECUTION_ROLE_ARN>" \
  --network-configuration '{"networkMode":"PUBLIC"}' \
  --protocol-configuration '{"serverProtocol":"MCP"}' \
  --authorizer-configuration '{
    "customJWTAuthorizer":{
      "discoveryUrl":"https://cognito-idp.<REGION>.amazonaws.com/<POOL_ID>/.well-known/openid-configuration",
      "allowedClients":["<M2M_CLIENT_ID>","<USER_CLIENT_ID>"]
    }
  }'
```

### 4. トークン取得と接続

#### client_credentials フロー

```bash
TOKEN=$(curl -s -X POST "https://mcp-<ACCOUNT_ID>.auth.<REGION>.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<M2M_CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=mcp-api/access" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

#### USER_PASSWORD_AUTH フロー

```bash
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id <USER_CLIENT_ID> \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=testuser,PASSWORD='YourPassword123!' \
  --region <REGION> \
  --query 'AuthenticationResult.AccessToken' \
  --output text)
```

#### MCP Inspector で接続

```bash
ENCODED_ARN=$(python3 -c "import urllib.parse; print(urllib.parse.quote('<RUNTIME_ARN>', safe=''))")

npx @modelcontextprotocol/inspector --cli \
  "https://bedrock-agentcore.<REGION>.amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT" \
  --transport http \
  --header "Authorization: Bearer $TOKEN" \
  --method tools/list
```

#### curl で接続

```bash
curl -s -N -X POST "https://bedrock-agentcore.<REGION>.amazonaws.com/runtimes/${ENCODED_ARN}/invocations?qualifier=DEFAULT" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}, "id": 1}'
```
