# Changelog

## 2026-04-02

- Them `DataTableStore` generic subworkflow cho `get` / `upsert` session state bang Data Table.
- Rebuild reviewer callback flow cua `Book Review`: `reviewing -> continueReview -> reviewPassed` va `reviewing -> stop`.
- `Book Review` hien luu session toi thieu (`sessionToken`, `reviewStatus`, `manifestUrl`, `folderUrl`, `rootFolderId`, `folderPath`) va rehydrate `Manifest.json` bang `manifestUrl`.
- `GG Drive Manager` bo sung `get` bang `fileUrl`, download binary, va tra lai payload de parse file tiep trong workflow cha.
- Canonicalized Book Review tren 1 template duy nhat: `workflows/book-review/book-review.workflow.json`.
- Don wrapper, registry, docs, rules, skills, va naming theo 1 workflow style duy nhat.
- Loai bo tooling runtime cu khong con khop voi workflow canonical hien tai.
- Them `docs/book-review-todo.md` de giu backlog reviewer/media/session/E2E cho giai doan tiep theo.

## 2026-04-02T09:07:08Z

- Workflow sync (UI -> JSON) processed 10 workflow(s): changed=7, missing_ui_folder=0, registry_new=0, registry_updated=10, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=10, changed=7, unchanged=4, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, Book Review, GG Sheet Manager, GG Drive Manager, Text To Videos VEO3, Text To Images.

## 2026-04-02T09:14:16Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=10, changed=0, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-02T09:15:59Z
- Workflow sync (UI -> JSON) processed 10 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=10, changed=3, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, GG Sheet Manager, GG Drive Manager.

## 2026-04-02T12:27:36Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=4, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=4, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Sheet Manager, DataTableStore, GG Drive Manager.

## 2026-04-02T12:32:05Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: DataTableStore.

## 2026-04-02T12:32:41Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: DataTableStore.

## 2026-04-02T15:42:03Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=5, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=4, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, GG Sheet Manager, DataTableStore, GG Drive Manager.

## 2026-04-02T16:28:24Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=3, unchanged=8, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Sheet Manager, GG Drive Manager.

## 2026-04-02T18:05:38Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-02T18:39:04Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T03:19:16Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-03T03:40:43Z
- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.
