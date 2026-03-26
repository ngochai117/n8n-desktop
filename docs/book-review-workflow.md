# Book Review Workflow (Simplified Reviewer Loop)

## Muc tieu
- Tao 1 ban review day du (`intro`, `part_xx`, `outro`) tu Gemini.
- QC AI danh gia chat luong noi dung truoc khi qua metadata.
- Reviewer duyet qua Telegram voi 2 stage:
  1. Stage Review: tiep tuc / dung / doi noi dung review.
  2. Stage Metadata: tiep tuc / dung / doi metadata.
- Metadata duoc tao 1 request/lần va tra du bo:
  - `title`, `caption`, `thumbnail_text`, `hashtags`, `youtube_description_long`.

## Flow Node
1. `When chat message received`
2. `Set Config`
3. `Generate Full Review`
4. `Parse Review Sections`
5. `Set Notify Targets`
6. `Reviewer Orchestrator`
7. `Build Notify Payload`
8. `Notify via Shared Workflow`
9. `Return Chat Response`

## Reviewer Orchestrator
- Gui preview review + diem QC len Telegram.
- Hien inline buttons: `Tiếp tục | Dừng | Đổi`.
- Dong thoi chap nhan chat command:
  - `tiep` / `continue`
  - `dung` / `stop`
  - `doi <yeu_cau_chinh_sua>`
- Neu reviewer chon `doi`, node goi AI de sua lai review theo instruction va QC lai.
- Khi reviewer `tiep` o stage review, node moi tao metadata.
- Stage metadata cung co `Tiếp tục | Dừng | Đổi`; `doi` se goi AI tao lai full bundle metadata.

## Output chinh
- `full_review`
- QC fields: `qc_checks`, `qc_issues`, `hook_score`, `clarity_score`, `originality_score`, `practical_value_score`, `risk_level`, `score_warnings`
- Metadata fields:
  - `video_title`
  - `video_caption`
  - `video_thumbnail_text`
  - `video_hashtags`
  - `youtube_description_long`
- Reviewer fields:
  - `reviewer_session_token`
  - `reviewer_decision`
  - `reviewer_gate_status`
  - `reviewer_commands`
- `message`: review + JSON payload tong hop

## Luu y van hanh
- Flow reviewer khong dung `sendAndWait` webhook.
- Chi can outbound call den Telegram Bot API (`getUpdates`, `sendMessage`).
- Neu Telegram token/chat id thieu, node reviewer se skip va tra ket qua hien co.
