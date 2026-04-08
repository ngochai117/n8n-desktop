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
  - `resolvedToolName`
  - `commandType`
  - `args`

### Y nghia tung field input
- `triggerSource`: nguon kich hoat. Thuong la `chat`, `manual`, hoac `schedule`.
- `commandText`: cau lenh goc can xu ly. Vi du: `check sprint`, `status sprint`, `release sprint`.
- `channel`: kenh goi. Thuong la `googleChat`, `n8nChatTrigger`, `manualTrigger`, hoac `system`.
- `sessionId`: session key duy nhat de luu memory/state. Thuong theo dang `spaceId:threadKey`.
- `spaceId`: ID cua space/chat room. Huu ich khi sau nay can scope session theo room.
- `threadKey`: thread hien tai. Dung de giu context hoi thoai va reply dung thread.
- `resolvedToolName`: ten tool ma router da chon. Vi du: `sprintHealthcheck`.
- `commandType`: loai lenh con cua tool. Vi du voi demo command co the la `approve`, `reject`, `cancel`, `release_sprint`.
- `args`: object mo rong cho tham so rieng cua tool. Hien tai thuong rong `{}`, nhung day la cho de mo rong ve sau.

### Ghi chu input
- Subworkflow business nen doc tu dung contract nay, khong tu y doi ten field.
- Neu can them field moi, uu tien them vao `args` truoc. Chi nang cap schema chung khi field do that su dung cho nhieu tool.

## 3. Output contract cua subworkflow
- Tra ve toi thieu:

```json
{
  "toolName": "...",
  "toolType": "read",
  "approvalRequired": false,
  "executeMode": "direct",
  "resultText": "...",
  "resultData": {},
  "deliveryPlan": {
    "version": "v2",
    "thread": {},
    "destinations": [],
    "messages": []
  },
  "followUpHints": []
}
```

### Y nghia tung field output
- `toolName`: ten chuan cua tool dang tra ket qua. Vi du: `sprintHealthcheck`.
- `toolType`: nhom tool.
  - `read`: chi doc/phan tich, khong gay side effect.
  - `proposal`: tao de xuat, thuong dung truoc buoc approve.
  - `action`: co kha nang gay side effect.
- `approvalRequired`: `true` neu tool nay phai cho approve truoc khi action that.
- `executeMode`:
  - `direct`: tra ket qua ngay.
  - `afterApproval`: chi duoc chay sau khi da duoc approve.
- `resultText`: cau tra loi text de AI/top-level co the dung ngay.
- `resultData`: payload co cau truc cho phan render, logging, hoac xu ly tiep.
- `deliveryPlan`: huong dan top-level phai gui ket qua nhu the nao.
- `followUpHints`: cac lenh goi y tiep theo, de sau nay co the dung cho UX/goi y.

## 4. Delivery plan contract
- `deliveryPlan` hien theo chuan `v2`.
- Trigger chi con mo ta nguon vao (`channel`, `triggerSource`).
- Subworkflow/tool moi la noi quyet dinh gui di dau qua `deliveryPlan.destinations[]`.
- Top-level chi con doc contract va delivery generic.

### `deliveryPlan.thread`
- `mode`: cach xu ly thread.
  - `singleThread`: top-level tao/gom message vao cung mot thread push.
- `threadKeyHint`: chuoi goi y de top-level sinh `threadKey` on dinh va de trace. Vi du: `sprint-healthcheck-12345`.

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

### Vi du `deliveryPlan`
```json
{
  "version": "v2",
  "thread": {
    "mode": "singleThread",
    "threadKeyHint": "sprint-healthcheck-490206"
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
- Top-level loc `destinations[]` theo config kha dung.
- Neu tool yeu cau `pushGoogleChat` ma `ggChatWebhookUrl` rong:
  - kenh interactive (`googleChat`, `n8nChatTrigger`, `manualTrigger`) se fallback theo default destinations cua top-level, thuong la `reply`
  - kenh `system/schedule` se skip push, khong fail cung workflow

## 6. Router config (`toolRegistry`)
- Moi tool moi phai duoc khai bao trong `Config Main` cua `MoMo AI Assistant Tool Router`.
- 1 entry trong `toolRegistry` hien co dang:

```json
{
  "toolName": "sprintHealthcheck",
  "workflowRegistryKey": "MoMo AI Assistant Tool Sprint Healthcheck",
  "workflowId": "__REGISTRY__:MoMo AI Assistant Tool Sprint Healthcheck",
  "enabled": true,
  "matchers": [
    { "pattern": "check\\s+sprint", "flags": "i" }
  ],
  "args": {}
}
```

### Y nghia field trong `toolRegistry`
- `toolName`: ten logic cua tool.
- `workflowRegistryKey`: key de map vao `workflow-registry.json`.
- `workflowId`: token se duoc wrapper import patch sang workflow ID that.
- `enabled`: bat/tat tool.
- `matchers`: danh sach regex route command.
  - `pattern`: regex pattern.
  - `flags`: regex flags, thuong la `i`.
  - `commandType`: tuy chon, dung khi 1 tool co nhieu lenh con.
- `args`: object constant de router day them vao subworkflow.
  - `args` cua `tool` va `matcher` duoc merge lai trong router.
  - co the dung de mo rong hanh vi delivery ma khong sua top-level. Vi du:
    - `additionalDestinations: [{ "type": "pushGoogleChat" }]`

## 7. Neu la tool moi
- Tao subworkflow moi.
- Them 1 entry moi trong `toolRegistry` cua `MoMo AI Assistant Tool Router`.
- Giu `workflowId` dang token:

```text
__REGISTRY__:Ten Workflow
```

## 8. Import lai
- Neu sua router hoac tool, chay:

```bash
bash scripts/workflows/import/import-momo-ai-assistant-tool-router-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-workflow.sh
```

## 9. Neu sua tren UI
- Sync nguoc ve repo:

```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "MoMo AI Assistant Tool Router" --apply
```

- Thay ten workflow neu ban sua tool khac.

## 10. Verify
- Chay checklist:

```bash
bash scripts/workflows/tests/test-momo-ai-assistant-checklist.sh
```

## 11. Rule nho nhanh
- Them tool moi: sua `subworkflow` + `toolRegistry`.
- Tool tu tra `deliveryPlan.destinations[]` + `messages[]`.
- Import xong moi test.
- Neu loi runtime workflow tool, check truoc: workflow co `active` chua.
