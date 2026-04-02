# Book Review Workflow

## Muc tieu
- Duy tri 1 workflow canonical cho Book Review.
- Uu tien flow de doc tren UI, stage ro rang, debug de.
- Khong song song 2 style workflow cho cung use case.

## Topology hien tai
1. Trigger nhan message vao workflow.
2. `Config Main` chuan hoa shared values can dung lai.
3. `Outline AI Agent` tao scene outline.
4. `Manifest AI Agent` mo rong outline thanh review manifest.
5. `QC AI Agent` danh gia output.
6. `Prepare Manifest` canonicalize payload cuoi:
   - `manifest`
   - `manifestJSONString`
   - `contentReadable`
   - `qc`
   - `ggDriveFolderName`
7. Persist hai file len Drive:
   - `review_manifest.json`
   - `review_readable.txt`
8. Gui review ready message len Telegram.

## Design style
- Shared values dat o `Config Main`.
- Khong de config node phinh to vo ly.
- Gia tri cuc bo thi dat ngay tai node/cum dang dung no.
- Moi AI stage co node rieng cho model, agent, parser.
- Co 1 node canonicalize truoc khi persist/gui.
- Flow hien tai uu tien generate va persist draft sach se, chua nhung branch reviewer/media chua duoc rebuild.

## Output chinh
- `reviewManifest`: JSON scene manifest
- `reviewReadable`: ban text doc duoc
- `qc`: ket qua QC co score + feedback
- Drive links cho hai file output

## Tiep tuc
- Toan bo reviewer/media/session backlog duoc ghi tai `docs/book-review-todo.md`.

