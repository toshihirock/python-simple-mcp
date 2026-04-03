# MCP Server (Docker)

MCP (Model Context Protocol) サーバーの Docker コンテナです。

## ビルドと起動

```bash
finch build -t mcp-server .
finch run -d --name mcp-server -p 80:80 mcp-server
```

### 停止と削除

Finch では `-d` と `--rm` を併用できないため、停止後に手動で削除してください。
削除しないとポートフォワーディングが残ることがあります。

```bash
finch stop mcp-server
finch rm mcp-server
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

| Fargate CPU アーキテクチャ | イメージ |
|---|---|
| X86_64 | `toshihirock/python-simple-mcp:amd64` |
| ARM64 | `toshihirock/python-simple-mcp:arm64` |

## curl での使い方

このサーバーは `stateless_http=True` で動作しているため、`initialize` のハンドシェイクなしで直接メソッドを呼び出せます。

### ツール一覧の取得

```bash
curl -s -X POST "http://127.0.0.1:80/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": 2}'
```

### ツールの呼び出し（例: add_numbers）

```bash
curl -s -X POST "http://127.0.0.1:80/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": { "name": "add_numbers", "arguments": { "a": 3, "b": 5 } },
    "id": 3
  }'
```
