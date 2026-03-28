# Book Review Workflow (Main + Reusable Media)

## Muc tieu
- Tao 1 ban review day du (`intro`, `part_xx`, `outro`) tu Gemini.
- QC AI danh gia chat luong noi dung truoc khi qua metadata.
- Reviewer duyet qua Telegram voi 2 stage:
  1. Stage Review: tiep tuc / dung / doi noi dung review.
  2. Stage Metadata: tiep tuc / dung / doi metadata.
- Metadata duoc tao 1 request/lần va tra du bo:
  - `title`, `caption`, `thumbnail_text`, `hashtags`, `youtube_description_long`.

## Topology
1. `book-review.workflow.json` (main):
   - Main generate (`Generate Full Review`, `Parse Review Sections`)
   - Router (`Telegram Trigger`, `Parse Telegram Event`, `Parse Telegram Start Command`)
   - Worker (`Handle Reviewer Event`)
   - Media orchestration (`Process Media Assets (Worker)` -> Execute `Text To Images` + `TTS` -> `Finalize Media Assets (Worker)`)
2. `text-to-images.workflow.json` (reusable):
   - `Execute Workflow Trigger` + `Form Trigger`
   - Input modes: `form_upload | drive_url`
   - Output modes: `inline | drive_export`
3. `tts.workflow.json` (reusable):
   - `Execute Workflow Trigger` + `Form Trigger`
   - Input modes: `form_upload | drive_url`
   - Output modes: `inline | drive_export`

## Reviewer Orchestration
- Gui preview review + diem QC len Telegram.
- Hien inline buttons: `Tiếp tục | Dừng | Đổi`.
- Dong thoi chap nhan chat command:
  - `tiep` / `continue`
  - `dung` / `stop`
  - `doi <yeu_cau_chinh_sua>`
- Neu reviewer chon `doi`, worker goi AI de sua lai review theo instruction va QC lai.
- Khi reviewer `tiep` o stage review, node moi tao metadata.
- Stage metadata cung co `Tiếp tục | Dừng | Đổi`; `doi` se goi AI tao lai full bundle metadata.
- Neu reviewer tiep tuc den final success (`metadata_continue`/`auto_continue_metadata`), main moi chay media branch va merge ket qua.

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
- Media fields:
  - `media_assets` (merge deterministic theo `chunk_key`)
  - `media_pipeline_status`
  - `media_stats`

## Luu y van hanh
- Flow reviewer khong dung `sendAndWait` webhook.
- Chi can outbound call den Telegram Bot API (`sendMessage`, callback APIs).
- Neu Telegram token/chat id thieu, node reviewer se skip va tra ket qua hien co.
- Workflow media reusable co the chay doc lap khong can full luong `book-review`.
