# Book Review Workflow Spec

Tai lieu chuan cho workflow: `Book Review Gemini via CLIProxyAPI`.

## 1) Muc tieu workflow
- Nhan ten sach + tac gia tu chat.
- Goi Gemini qua CLIProxy de sinh bai review dai theo master prompt.
- Tu dong goi tiep `Continue` khi model tra ve `-CONTINUE-`.
- Gom noi dung cuoi, parse thanh cac section (`intro`, `part_xx`, `outro`).
- Gui notify qua workflow dung chung `Shared Notification Router`.

## 2) Input/Output contract
Input chinh:
- `chatInput` (tu `When chat message received`).

Output chinh tra ve chat (last node chain):
- `message` (string)
- `full_review` (string)
- `turn_count` (number)
- `stop_reason` (`completed | max_turns | api_error`)
- `model`, `fallback_model`, `fallback_used`, `user_input`

Output parser section (de step sau tach file/noi dung):
- `review_sections`: danh sach `{ order, id, title, content, file_name }`
- `review_section_texts`, `review_section_ids`
- `review_intro`, `review_parts`, `review_outro`
- `review_sections_count`
- `review_control_tag` (`continue | end | null`)
- `review_parse_status`, `review_parser_warning`

## 3) Node flow hien tai
1. `When chat message received`
2. `Set Config`
3. `Generate Full Review`
4. `Parse Review Sections`
5. `Set Notify Targets`
6. `Build Notify Payload`
7. `Notify via Shared Workflow`

## 4) Continue/End + parser section
- Control tag bat buoc o cuoi chunk: `-CONTINUE-` hoac `-END-`.
- Neu `-CONTINUE-`: workflow day them user message `Continue` de lay chunk tiep.
- `Generate Full Review` se gom cac chunk, bo marker trung gian, giu ket qua cuoi.
- `Parse Review Sections` doc block dang:
  - `<<<SECTION|<id>|<title>>> ... <<<END_SECTION>>>`
- Neu khong parse duoc section marker: fallback 1 section `full_review`.

## 5) Script van hanh lien quan
- Import workflow: `bash scripts/workflows/import/import-book-review-workflow.sh`
- Sync UI -> JSON: `bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "Book Review Gemini via CLIProxyAPI" --apply`
- Automation checklist: `bash scripts/workflows/tests/test-book-review-checklist.sh`

## 6) Quy uoc bao tri
- Truoc khi sua workflow book-review: doc file nay truoc.
- Sau khi sua workflow:
  - Neu flow node hoac input/output contract doi -> cap nhat file nay.
  - Neu doi prompt -> cap nhat `workflows/prompts/book-review-master-prompt.txt` va import lai workflow.
