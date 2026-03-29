# Book Review Workflow (Main + Reusable Media)

## Muc tieu
- Tao 1 ban review day du (`intro`, `part_xx`, `outro`) tu Gemini.
- Master prompt tra kem metadata trong cung response, workflow boc tach metadata rieng:
  - `title`, `caption`, `thumbnail_text`, `hashtags`.
- Reviewer Telegram chi con 1 gate:
  - `Tao Media` / `Dung`.
- QC AI chay tach rieng, khong block gate `Tao Media`.

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
- Sau lenh `book-review ...`, workflow tao session + persist ngay review/metadata len Drive.
- Telegram gui message `[REVIEW READY]` kem link:
  - review file
  - metadata file
  - session folder
  - session sheet (neu co)
- Hien inline buttons: `Tao Media | Dung` (callback `brv:media:c|s:<token>`).
- Neu reviewer bam `Tao Media` (`media_continue`), main moi chay media branch va merge ket qua.
- QC duoc gui message `[QC REVIEW]` rieng, khong con inline action tiep tuc.

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
