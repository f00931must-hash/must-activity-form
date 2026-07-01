# MUST Activity System v1.1.1

活動報名與回饋管理平台。

## 功能
- 學生端活動列表、報名表、回饋表
- 老師端 Google 登入後台
- 新增/修改/刪除活動
- 基本報名欄位：姓名、系級、學號、電話、餐點
- 自訂報名欄位
- 自訂回饋滿意度題目
- 心得最低字數限制
- 報名/回饋連結與 QR Code
- 報名 CSV、回饋 CSV、成果 Word 匯出
- 多老師 Email 管理

## 上線
1. 解壓縮後整包上傳 GitHub。
2. GitHub Pages 設定 main / root。
3. Firebase Firestore Rules 貼上 `firebase/firestore.rules`。

## v1.0.1 修正
- 修正 GitHub Pages 路徑 404。
- 新增 frontend/shared/js 相容轉接檔。

## v1.0.2 修正
- 修正 Firebase 官方 apiKey 與 appId。

## v1.0.3 修正
- 修正後台儲存活動時 status 可能 undefined 的問題。
- 修正 resetForm 的 search 命名衝突。
- 回饋題目改為滿意度李克特五級：非常滿意、滿意、普通、不滿意、非常不滿意。

## v1.0.4 修正
- 修正後台使用瀏覽器全域變數 `status` 導致無法儲存活動。
- 修正活動資料送出前清除 undefined 欄位。

## v1.0.5 修正
- 重寫後台 admin.js，避免 DOM ID 與瀏覽器全域變數衝突。
- 修正活動儲存失敗問題。

## v1.1 修正
- 儀表板移除總報名人次，改顯示報名中活動。
- 新增「查看報名名單」彈窗，保留下載功能。
- 下載按鈕改成較直白文字。
- 新增回饋開放時間，可自動開放回饋。
- 新增活動附件/連結欄位，可放行程表、簡章等。

## v1.1.1 修正
- 修正後台活動列表載入失敗。
- 修正彈窗按鈕不存在時造成 JS 中斷。
