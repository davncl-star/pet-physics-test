# pet-physics-test — 桌面寵物理獨立驗證頁

單檔、零依賴的獨立測試程序：不啟動 Electron、不依賴 windows_pet 就能驗證桌面寵物的物理語義。
直接用瀏覽器開啟 `pet-physics-test.html` 即可（140KB，內嵌 Matter.js 與 P0 `physics_host.mjs`）。

## 覆蓋範圍

| 區塊 | 內容 |
|---|---|
| P0 拋擲 | 慢速釋放＝放置、快速甩出＝物理 episode（拋物線 → 落地 → 入睡）、grab 搶占、F5 reset 護欄、拖拽夾緊、甩出隨機性 |
| P3-① 桌面玩具 | 桌面座標的玩具世界、寵物以 static proxy 參與碰撞、玩具上限 8、TTL 20 秒、低回彈（會停下來） |

頁內自動測試共 **17 項**，載入時自動執行並在表格中列出結果。

## 兩項實機缺陷的回歸斷言

- **T11（低回彈）**：量「觸地後的反彈高度」< 50px。缺陷值（牆壁 0.4 / 玩具 0.5）會讓玩具像彈床一樣飛出畫面，反彈高度 ~84px → 斷言轉紅。
- **T16（初始化競態）**：世界建立時寵物 proxy 必須以「當下」寵物座標初始化。推送式更新若晚到，proxy 會永久停在過期座標，玩具再也不會被寵物彈開。

## 建置

```powershell
.\build-pet-physics-test.ps1
```

腳本會把 `pet-physics-test.template.html` 與兩個來源組裝成單檔，並跑兩道門禁：

1. **文字門禁** — 不得殘留 `/*__MATTER_JS__*/`、`??`（基線 1，是 Matter 自己的 feature probe）、`.flat()`、`export `。
2. **行為門禁**（`probe_bundle_fixcheck.js`）— 直接跑組裝後的 bundle，驗證 engine 修復 F1–F6 都在。

### 輸入來源

| 來源 | 位置 |
|---|---|
| Matter.js | `vendor/matter.min.js`（無此檔時退回 `matter-js-test\build\matter.min.js`） |
| P0 物理模組 | `C:\Users\Admin\Documents\openhanako\windows_pet\electron\renderer\physics_host.mjs`（逐字嵌入，僅降級舊瀏覽器語法） |

`physics_host.mjs` 若要獨立於 windows_pet，可自行放到 `vendor\physics_host.mjs` 並修改腳本中的 `$PHYS`。

## 驗證

```powershell
# 頁內 17 項 + fixes-gate 6/6
.\build-pet-physics-test.ps1
```

瀏覽器驗證（Edge headless）：

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
  --dump-dom --virtual-time-budget=10000 "file:///$PWD/pet-physics-test.html"
```

表格中 `class="pass"` / `class="fail"` 的列數即為結果。

## 守門必須先證明抓得到缺陷

一個從沒紅過的斷言不等於守門：改壞參數重跑，確認對應斷言轉紅後，才信任綠燈。

```powershell
# 注入 D4 缺陷值 → 預期 T11 轉 FAIL（16/17）
$s = Get-Content pet-physics-test.html -Raw `
  -replace 'restitution: 0\.05','restitution: 0.4' `
  -replace 'restitution: 0\.15','restitution: 0.5'
[System.IO.File]::WriteAllText("$PWD\probe.html", $s, (New-Object System.Text.UTF8Encoding($false)))
```

## 相關

- windows_pet 端對應實作與測試：`electron/renderer/ui/desktop_toys.mjs`、`electron/tests/p3_desktop_toys.test.js`、`electron/scripts/cdp-desktop-toys-check.mjs`
- Matter.js 分層測試與 engine 修復：`davncl-star/matter-js`（分支 `layered-physics-tests`）

## CI

`.github/workflows/verify.yml`（windows-latest）：

1. 建置單檔頁（文字門禁 + engine 修復行為門禁 F1–F6）
2. 用預裝的 Edge headless 執行頁內斷言，出現任何 FAIL 即失敗

> `vendor/physics_host.mjs` 是 windows_pet 的 P0 物理模組副本（windows_pet 為私有倉庫，本倉庫需要能獨立建置）。若要改用更新版本，設環境變數 `PET_PHYSICS_HOST` 指向它即可；CI 亦同。
