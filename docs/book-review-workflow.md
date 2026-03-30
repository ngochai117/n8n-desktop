# Book Review Workflow V2 (Scene-Based)

## Muc tieu
- Chuyen canonical content tu `SECTION` sang `review_manifest.scenes`.
- Output video target `16:9`, `15-20 phut`, text review dai (`~15k-20k ky tu`) voi so scene gioi han `8-14`.
- Reviewer gate giu nguyen `Tao Media | Dung`, nhung reviewer xem `review_readable` + link `review_manifest`.

## Topology
1. `book-review.workflow.json` (main):
   - Generate 2-pass:
     - `Generate Full Review`: pass 1 scene outline -> pass 2 scene manifest.
     - `Parse Review Sections`: normalize `review_manifest` + tao `review_readable`.
   - Reviewer worker:
     - `Handle Reviewer Event`
     - `Send Review QC And Action (Worker)`
   - Media orchestration:
     - `Process Media Assets (Worker)`
     - Execute `TTS` truoc, sau do execute visual workflow theo `media_visual_mode`:
       - `image` -> `Text To Images`
       - `video` -> `Text To Videos VEO3`
     - `Finalize Media Assets (Worker)`
2. `text-to-images.workflow.json`:
   - Nhan truc tiep scene items (`scene_id`, `order`, `image_prompt_en`, ...)
   - Tra ve item theo scene (`image_url`, `image_status`, `image_drive_*`).
3. `text-to-videos-veo3.workflow.json`:
   - Nhan truc tiep scene items + duration target theo scene.
   - Contract request da ho tro strategy `generate_until_enough`:
     - `target_duration_seconds`
     - `shot_count_initial`
     - `shot_prompts_en[]`
     - `duration_buffer_seconds`
   - Co `mock_mode` de test khi chua co tai khoan Veo3.
   - Tra ve item theo scene (`video_url`, `video_status`, `video_drive_*`) va giu alias `image_*` de tuong thich nguoc.
4. `tts.workflow.json`:
   - Nhan truc tiep scene items (`scene_id`, `order`, `narration_text`, ...)
   - Tra ve item theo scene (`voice_url`, `tts_status`, `duration_seconds`, `voice_drive_*`).

## Data Contracts
- Source-of-truth moi: `review_manifest`:
  - `book { title, author, style_keywords }`
  - `video { aspect_ratio, target_duration_min_sec, target_duration_max_sec, estimated_total_duration_sec }`
  - `scenes[] { scene_id, order, scene_title, scene_role, narration_text, image_prompt_en, highlight_quote_vi, estimated_duration_sec, transition }`
- Reviewer-readable: `review_readable` (text) duoc sinh tu `review_manifest`.
- Media merge key: `scene_id + order`.
- Main config ho tro mode:
  - `media_visual_mode=image` (mac dinh, su dung luong anh)
  - `media_visual_mode=video` (bat luong `text-to-videos-veo3`)

## Session + Drive
- Session assets v2:
  - `review_readable.txt`
  - `review_manifest.json`
  - session folder + session sheet (neu bat)
- Telegram `[REVIEW READY]` gui links:
  - readable draft
  - scene manifest
  - session folder/sheet (neu co)

## Luu y
- `scene_01` luon la hook; scene cuoi luon la outro.
- QC co them context `review_manifest` + `review_readable`.
- Khi dung mode `video`, target duration scene uu tien lay tu `TTS duration_seconds`; neu thieu thi fallback `estimated_duration_sec`.
- Path render server duoc chuan bi contract payload trong session package; v1 van uu tien persist Drive + media assets.
