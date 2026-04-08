# MoMo AI Assistant Subworkflow Guide

Guide nay danh cho truong hop them moi hoac chinh sua subworkflow cua `MoMo AI Assistant`.

## 1. Sua dung noi
- Business logic nam trong subworkflow.
- Command routing nam trong `MoMo AI Assistant Tool Router`.
- Main workflow khong dung de nhan them logic business-case.

## 2. Input contract cua subworkflow
- Trigger phai la `When Executed by Another Workflow`.
- Input schema hien tai giu dung contract nay:
  - `triggerSource`
  - `commandText`
  - `channel`
  - `sessionId`
  - `spaceId`
  - `threadKey`
  - `actorId`
  - `actorDisplayName`
  - `args`

### Y nghia tung field input
- `triggerSource`: nguon kich hoat. Thuong la `chat`, `manual`, hoac `schedule`.
- `commandText`: cau lenh goc can xu ly. Vi du: `check sprint`, `status sprint`, `release sprint`.
- `channel`: kenh goi. Thuong la `googleChat`, `n8nChatTrigger`, `manualTrigger`, hoac `system`.
- `sessionId`: session key duy nhat de luu memory/state. Thuong theo dang `spaceId:threadKey`.
- `spaceId`: ID cua space/chat room. Huu ich khi sau nay can scope session theo room.
- `threadKey`: thread hien tai. Dung de giu context hoi thoai va reply dung thread.
- `actorId`: dinh danh actor goi lenh (chat sender/manual/schedule pseudo user).
- `actorDisplayName`: ten hien thi cua actor.
- `args`: object mo rong cho tham so rieng cua tool (vi du `additionalDestinations`, `commandType` cho demo command).

### Ghi chu input
- Subworkflow business nen doc tu dung contract nay, khong tu y doi ten field.
- Neu can them field moi, uu tien them vao `args` truoc. Chi nang cap schema chung khi field do that su dung cho nhieu tool.
- Khong pass-through runtime config qua boundary. Moi business subworkflow tu giu `Config Main` local lam source of truth.

## 3. Output contract cua subworkflow
- Tra ve toi thieu:

```json
{
  "toolName": "...",
  "resultText": "...",
  "deliveryPlan": {
    "thread": {},
    "destinations": [],
    "messages": []
  }
}
```

### Y nghia tung field output
- `toolName`: ten chuan cua tool dang tra ket qua. Vi du: `sprintHealthcheck`.
- `resultText`: cau tra loi text de AI/top-level co the dung ngay.
- `deliveryPlan`: huong dan top-level phai gui ket qua nhu the nao.

## 4. Delivery plan contract
- `deliveryPlan` khong can marker version o runtime.
- Trigger chi con mo ta nguon vao (`channel`, `triggerSource`).
- Subworkflow/tool moi la noi quyet dinh gui di dau qua `deliveryPlan.destinations[]`.
- Top-level chi con doc contract va delivery generic.

### `deliveryPlan.thread`
- `threadKey`: thread key uu tien cao nhat. Neu co, top-level se dung truc tiep.
- Thu tu uu tien hien tai o top-level:
  - `deliveryPlan.thread.threadKey`
  - `threadKey` tu event (`Config Main`)
  - fallback key do delivery layer tu sinh

### `deliveryPlan.destinations[]`
- Moi phan tu la 1 dich giao message.
- Cac field chinh:
  - `type`: loai dich giao.
    - `reply`: tra ve truc tiep cho trigger hien tai.
    - `pushGoogleChat`: ban proactive qua Google Chat webhook.
- Hien tai top-level support 2 `type` nay. Sau nay muon them kenh moi thi mo rong o lop delivery, khong can doi contract business tool.

### `deliveryPlan.messages[]`
- Moi phan tu la 1 message can gui.
- Cac field chinh:
  - `messageKey`: key logic cua message. Vi du: `summaryCard`, `warningDetails`, `reply`.
  - `type`: kieu message.
    - `text`: text thuong.
    - `googleChatCardV2`: Google Chat card payload.
  - `destinations`: danh sach `destination.type` ma message nay duoc phep di toi.
    - Vi du: `["reply"]`, `["pushGoogleChat"]`, hoac `["reply", "pushGoogleChat"]`.
  - `payload`: body that se gui.
- Thu tu trong mang `messages[]` la quan trong cho `pushGoogleChat`.
  - Main flow gui theo thu tu item cua mang nay.
  - Muon card summary len truoc, hay dat `summaryCard` truoc `warningDetails`.

### Vi du `deliveryPlan`
```json
{
  "thread": {
    "threadKey": "sprint-healthcheck-490206"
  },
  "destinations": [
    { "type": "reply" },
    { "type": "pushGoogleChat" }
  ],
  "messages": [
    {
      "messageKey": "replySummary",
      "type": "text",
      "destinations": ["reply"],
      "payload": { "text": "..." }
    },
    {
      "messageKey": "summaryCard",
      "type": "googleChatCardV2",
      "destinations": ["pushGoogleChat"],
      "payload": { "cardsV2": [] }
    },
    {
      "messageKey": "warningDetails",
      "type": "text",
      "destinations": ["pushGoogleChat"],
      "payload": { "text": "..." }
    }
  ]
}
```

## 5. Config Google Chat
- `ggChatWebhookUrl` giu o top-level `MoMo AI Assistant` -> node `Config Main`.
- Khong duplicate webhook URL trong business subworkflow.
- Top-level loc destination `pushGoogleChat` theo config kha dung.
- Neu tool yeu cau `pushGoogleChat` ma `ggChatWebhookUrl` rong:
  - top-level skip push delivery va gan `ggChatDeliverySkipReason`
  - workflow van tiep tuc binh thuong (khong fail cung)

## 6. Delivery execution o main flow (quan trong)
- Main flow delivery theo pattern:
  - `Prepare GGChat Delivery Messages`
  - `Split Out GGChat Delivery Messages`
  - `Loop Over GGChat Delivery Messages` (`batchSize = 1`)
  - `Send GGChat Delivery Message`
  - quay lai `Loop Over GGChat Delivery Messages` den khi het item
  - output `done` cua loop moi sang `Build Delivery Ack`
- Y nghia:
  - khong can node `Wait` de ep thu tu
  - moi request GGChat duoc gui lan luot, request truoc xong roi moi sang request sau
  - `Build Delivery Ack` tong hop trang thai tu toan bo response cua node `Send GGChat Delivery Message`

## 7. Router config (`toolRegistry`)
- Moi tool moi phai duoc khai bao trong `Config Main` cua `MoMo AI Assistant Tool Router`.
- 1 entry trong `toolRegistry` hien co dang:

```json
{
  "toolName": "sprintHealthcheck",
  "workflowId": "KMrBMKLm9ZNezxwx",
  "enabled": true,
  "matchers": [
    { "pattern": "check\\s+sprint", "flags": "i" }
  ],
  "args": {}
}
```

### Y nghia field trong `toolRegistry`
- `toolName`: ten logic cua tool.
- `workflowId`: workflow ID that cua subworkflow (`mode=id`).
  - Co the dung token dang `__REGISTRY__:Ten Workflow` neu ban muon de import wrapper tu patch.
  - Hoac hard-code workflow ID nhu runtime hien tai.
- `enabled`: bat/tat tool.
- `matchers`: danh sach regex route command.
  - `pattern`: regex pattern.
  - `flags`: regex flags, thuong la `i`.
  - `commandType`: tuy chon, dung khi 1 tool co nhieu lenh con.
- `args`: object constant de router day them vao subworkflow.
  - `args` cua `tool` va `matcher` duoc merge lai trong router.
  - co the dung de mo rong hanh vi delivery ma khong sua top-level. Vi du:
    - `additionalDestinations: [{ "type": "pushGoogleChat" }]`

### Single source of truth khi them/sua tool
- Muc tieu hien tai: han che sua nhieu noi.
- Khi them tool moi hoac sua route command:
  - CHINH: `toolRegistry` trong `MoMo AI Assistant Tool Router`.
  - KHONG can sua system prompt cua AI Agent cho tung command cu the.
  - KHONG can sua description cua `assistant_command_router` cho tung tool.
- System prompt va tool description da de o dang generic de dung lai cho nhieu tool.

## 8. Neu la tool moi
- Tao subworkflow moi.
- Them 1 entry moi trong `toolRegistry` cua `MoMo AI Assistant Tool Router`.
- Neu chon dung token registry, giu `workflowId` dang token:

```text
__REGISTRY__:Ten Workflow
```

## 9. Import lai
- Neu sua router hoac tool, chay:

```bash
bash scripts/workflows/import/import-momo-ai-assistant-tool-router-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-workflow.sh
```

## 10. Neu sua tren UI
- Sync nguoc ve repo:

```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "MoMo AI Assistant Tool Router" --apply
```

- Thay ten workflow neu ban sua tool khac.

## 11. Verify
- Chay checklist:

```bash
bash scripts/workflows/tests/test-momo-ai-assistant-checklist.sh
```

## 12. Rule nho nhanh
- Them tool moi: sua `subworkflow` + `toolRegistry`.
- Tool tu tra `deliveryPlan.destinations[]` + `messages[]`.
- `pushGoogleChat` gui tuan tu theo thu tu `messages[]`.
- Import xong moi test.
- Neu loi runtime workflow tool, check truoc: workflow co `active` chua.
- Trong cung workflow, uu tien doc truc tiep field tu node goc (`$('Ten node')`) thay vi pass-through qua nhieu node trung gian.
