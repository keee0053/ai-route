# Expo・バックエンド API契約

この文書をExpo版フロントエンドとCloudflare Workersバックエンドの共通仕様とする。
`POST /generate-route`の実装者はこの形式で返し、フロントはこの形式だけを参照する。

## Common rules

- JSONのプロパティ名はcamelCaseに統一する。
- 時間は整数の「分」、距離は整数の「メートル」で返す。
- 緯度・経度は10進数のnumberで返す。
- 値が取得できない項目は省略せず`null`を返す。配列は空配列`[]`を返す。
- APIキーはバックエンドだけに置き、レスポンスやExpoアプリへ含めない。
- 成功レスポンスは2xx、入力エラーは400、候補なしは404、外部API障害は502とする。

## POST /generate-route

希望条件に合う経由地を選び、経由地を含む正確なルートを返す。
Google Mapsの共有URLはExpo側で解析し、このAPIには解析後の`origin`と
`destination`を送る。

### Request

```json
{
  "origin": "大阪駅",
  "destination": "神戸ハーバーランド",
  "preferences": ["ocean", "cafe"],
  "freeText": "海沿いを走って景色のいいカフェに寄りたい",
  "timeConstraint": {
    "type": "extra_time",
    "minutes": 30
  },
  "waypointCount": 2
}
```

| Field | Type | Required | Rule |
|---|---|---:|---|
| `origin` | string | yes | 場所名、住所、または`lat,lng` |
| `destination` | string | yes | 場所名、住所、または`lat,lng` |
| `preferences` | string[] | yes | 1件以上。許可値は下記参照 |
| `freeText` | string | yes | 未入力は空文字。最大500文字 |
| `timeConstraint` | object | yes | 下記3形式のいずれか |
| `waypointCount` | 1 or 2 | yes | 希望する経由地数 |

`preferences`の許可値:

```text
scenic, ocean, night_view, mountain, cafe, gourmet, hot_spring, detour, quiet
```

`timeConstraint`の形式:

```json
{ "type": "none" }
{ "type": "extra_time", "minutes": 30 }
{ "type": "total_time", "minutes": 120 }
```

`minutes`は1以上の整数とする。`none`は時間上限を指定しないという意味であり、
バックエンドが内部で仮の60分上限を設定した場合でも、その値をAPI仕様として保証しない。

### Success response

```json
{
  "origin": {
    "name": "大阪駅",
    "lat": 34.702485,
    "lng": 135.495951
  },
  "destination": {
    "name": "神戸ハーバーランド",
    "lat": 34.67958,
    "lng": 135.178013
  },
  "normalRoute": {
    "durationMinutes": 44,
    "distanceMeters": 38700
  },
  "recommendedRoute": {
    "durationMinutes": 62,
    "distanceMeters": 42100,
    "extraMinutes": 18
  },
  "waypoints": [
    {
      "placeId": "ChIJ_example",
      "name": "海沿いのカフェ",
      "lat": 34.689,
      "lng": 135.21,
      "category": "カフェ",
      "rating": 4.4,
      "reviewCount": 210,
      "photoUrl": "https://ekz-server.example/photo?name=places%2F...",
      "tags": ["海が見える", "落ち着く"],
      "detourMinutes": 18
    }
  ],
  "reason": "海沿いで評価が高く、追加30分以内に収まる場所を選びました。",
  "googleMapsUrl": "https://www.google.com/maps/dir/?api=1&..."
}
```

### Response field rules

- `origin.lat/lng`と`destination.lat/lng`は取得できない場合のみ`null`。
- `normalRoute`は経由地なし、`recommendedRoute`は全経由地を含むRoutes APIの計算結果。
- `extraMinutes`は`recommendedRoute.durationMinutes - normalRoute.durationMinutes`。負数にしない。
- `waypoints`は実際に走行する順番で並べる。
- `waypoint.lat/lng`はGoogle Maps URL生成に必要なため必須。
- `category`、`rating`、`reviewCount`、`photoUrl`は取得できない場合`null`。
- `tags`はタグ生成に失敗した場合`[]`。
- `detourMinutes`はその経由地を加えたことによる追加時間の目安。
- `googleMapsUrl`は`origin`、`destination`、全`waypoints`を含む。

TypeScript上の正本は`mobile/types/route.ts`の`GenerateRouteRequest`と
`GenerateRouteResponse`とする。

## Error response

すべての新規APIは同じ形でエラーを返す。

```json
{
  "error": {
    "code": "NO_CANDIDATES",
    "message": "条件に合う寄り道候補が見つかりませんでした。"
  }
}
```

| HTTP | Code | Meaning |
|---:|---|---|
| 400 | `INVALID_REQUEST` | 必須項目、型、値が不正 |
| 404 | `ROUTE_NOT_FOUND` | 出発地・目的地間のルートがない |
| 404 | `NO_CANDIDATES` | 条件に合う経由地がない |
| 502 | `UPSTREAM_ERROR` | Google、Gemini、TypeSafeなど外部APIの障害 |
| 500 | `INTERNAL_ERROR` | 想定外のサーバーエラー |

メッセージは画面表示用の日本語、コードはフロントの分岐用とする。

Expo側でのみ発生するエラーは次のコードで管理する。

| Code | Meaning | Retry |
|---|---|---:|
| `NETWORK_ERROR` | インターネットまたはサーバーへ接続できない | yes |
| `TIMEOUT` | 20秒以内にAPIから応答がない | yes |
| `MAPS_URL_PARSE_FAILED` | Google Mapsの共有URLから出発地・目的地を取得できない | no |
| `INVALID_RESPONSE` | APIの応答がJSONでない、または読み取れない | yes |

再試行可能なエラーでは同じ入力を保持したまま「もう一度試す」を表示する。
`NO_CANDIDATES`など条件変更が必要なエラーでは「条件を見直す」を表示する。

## Existing endpoints

`POST /search`、`POST /tag`、`POST /next`、`GET /photo`は既存アプリとの互換性のため
当面維持する。Expo版は`POST /generate-route`完成後、ルート生成時に既存3 APIを
個別に呼ばず`POST /generate-route`だけを呼ぶ。

ルート編集用APIは別タスクで定義する。編集APIでも、この文書の`RouteWaypoint`と
`GenerateRouteResponse`を再利用する。
