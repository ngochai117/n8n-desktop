# Agent Rules (Global)

Muc tieu: bo rules dung chung, co the tai su dung cho cac project khac.

## 1) Confirm-first cho thay doi governance
- Neu muon them/sua/xoa rule hoac skill: phai xin xac nhan cua user truoc.
- Khong tu y mo rong pham vi rules khi chua duoc dong y.

## 2) Safe operations first
- Truoc khi xoa/don dep du lieu: thong bao ro se xoa gi.
- Khong chay lenh pha huy khong hoan tac neu chua duoc xac nhan.
- Uu tien quy trinh: kiem tra -> thong ke -> xac nhan -> thuc thi.

## 3) Living docs discipline
- Moi thay doi script/cau hinh/quy trinh: cap nhat `README.md`.
- Ghi 1 dong vao `Update Log` cho thay doi quan trong.

## 4) Prefer idempotent automation
- Script nen idempotent (chay lai khong gay side effects khong mong muon).
- Uu tien upsert thay vi tao moi vo dieu kien.

## 5) Security baseline
- Uu tien localhost-only trong moi truong local.
- Khong hard-code secrets vao code/template.
- Env/secrets phai duoc tach rieng, co file `.example`.
