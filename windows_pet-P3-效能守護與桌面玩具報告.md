# windows_pet — P3 物理能力報告（效能守護 ② + 桌面玩具 ①）

> 專案：`C:\Users\Admin\Documents\openhanako\windows_pet\electron`
> 日期：2026-11-04　　測試框架：jest（`NODE_OPTIONS=--experimental-vm-modules`）、Node v24.16.0、Electron 33 (Chromium 130)

---

## 一、結論先行

| 項目 | 狀態 | 關鍵數據 |
|---|---|---|
| P3-② 效能守護（soak） | ✅ 8/8 守門全過 | heap 斜率 **6.23 MB/h**、heap 曲線平臺化 5.8→6.0 MB、停泊時 **0 ms/frame** |
| P3-① 桌面級玩具 | ✅ 已實作＋8/8 單元測試＋**6/6 端到端（CDP）** | 單一透明 click-through overlay 視窗、寵物以 static proxy 參與碰撞、玩具上限 8 |
| 完整回歸 | ✅ 11 套件 / 150 項全過 | 未破壞 200×200 尺寸鎖、toast/bubble 聯動、`window:move` 通道 |
| 獨立驗證頁 | ✅ 重建通過 | 頁內 10/10 PASS、fixes-gate 6/6 PASS |

**這輪真正學到的是「量測方法本身會造假」**：先後抓出三個讓「記憶體洩漏」看起來成立、實際上不成立的量測缺陷，修掉之後 heap 曲線從 7868 MB/h 降到 6.23 MB/h——其中絕大部分是量測工具的問題，不是產品的问题。產品端只改了兩處真實的計時器保留。

---

## 二、P3-② 效能守護

### 2.1 守門設計（`scripts/soak-physics.mjs`）

8 個守門，任一失敗即退出碼 1：

1. `pair cache bounded` — pairs ≤ 64
2. `body registry bounded` — bodies ≤ 64
3. `detector list bounded` — detector ≤ 64
4. `toy count bounded` — toys ≤ 上限（12）
5. `heap slope acceptable` — ≤ 20 MB/h
6. `no step-time degradation` — 首尾 step 耗時比 ≤ 3x
7. `no NaN positions` — 所有座標有限
8. `idle cost below budget` — 閒置 step ≤ 0.5 ms

### 2.2 最終裁定（修正量測方法後，2 分鐘 soak）

```
[soak] 0.5min  heap=5.8MB   pairs=1 bodies=5 detector=5 toys=12
[soak] 1.0min  heap=5.9MB
[soak] 1.5min  heap=6.0MB
active step cost      : 0.0872 ms/step  (0.523% of a 60fps frame budget)
cost if we kept stepping the sleeping world: 0.0534 ms/step (0.320%)
parked runner cost    : 0 ms/frame  (寵物入睡 1.5s 後 Runner 停泊)

PASS pair cache bounded      pairs=1 (limit 64)
PASS body registry bounded   bodies=5 (limit 64)
PASS detector list bounded   detector=5 (limit 64)
PASS toy count bounded       toys=12 (limit 12)
PASS heap slope acceptable   6.23 MB/h (limit 20)
PASS no step-time degradation 0.68x (limit 3x)
PASS no NaN positions        clean
PASS idle cost below budget  0.0534 ms/step (limit 0.5)
```

### 2.3 缺陷與量測方法修正紀錄

| # | 現象 | 真因 | 處置 |
|---|---|---|---|
| D1 | 每顆玩具的 body 被保留約 4 秒 | `toy_physics.mjs` 的 TTL `setTimeout` 閉包捕获整個 toy 物件（含 body） | 改為只捕获 `toyId`，另存 `_byId` 索引由 `_recycleById()` 回收 |
| D2 | 淡出計時器連帶保留 body | 淡出 `setTimeout` 同時捕获 element 與 toy | 計時器只捕获 element |
| **M1** | heap 斜率 7868 MB/h | **量測缺陷**：soak 迴圈是同步 `while`，事件循環從不換輪 → 520ms 移除計時器永不到期 → 每輪都留一個 element | 每 25 輪 `await new Promise(r => setTimeout(r, 0))` 讓出宏任務輪次 |
| **M2** | WeakRef 探針顯示 2000/2000 body 存活 | **量測缺陷**：ES2021 規定 WeakRef 的 referent 在**當前 turn 結束前**不得回收；探針只 await 微任務，全程未跨 turn | 最終量測前 `await setImmediate` 兩次，強制結束當前 turn |
| **M3** | Matter 0.19 `Composite.remove` 後 `body.parent` 仍指向 world | 斷言用錯 API（不是產品缺陷） | 改斷言 `engine.world.bodies` 不再含該 body |

> 教訓：**「無法重現的 bug 是未解決的 bug」在效能領域同樣成立**——量測工具本身必須先被驗證（M1/M2 修掉前，任何 heap 數字都不可信）。

### 2.4 效能守護帶來的產品行為

- 寵物入睡 1.5 秒後 Runner **自動停泊**（`PhysicsHost.pause()`）→ 閒置 CPU 歸零；
- grab / throw / hop 事件會喚醒（`resume()`）；
- 喚醒時世界仍在休眠狀態時，step 成本僅 0.053 ms/frame（0.32% 影格預算）。

---

## 三、P3-① 桌面級玩具

### 3.1 架構決策

| 方案 | 評估 | 結論 |
|---|---|---|
| 每顆玩具一個 BrowserWindow | 每顆一個 Chromium 行程，記憶體過重，與「桌面寵物要低發熱」的底線衝突 | 否決 |
| **單一透明 overlay 視窗** | 覆蓋 pet 所在螢幕的 work area，`transparent` + `setIgnoreMouseEvents(true, {forward:true})` + `alwaysOnTop:'floating'`，按需建立、最後一顆玩具消失即關閉 | **採用** |

玩具世界分兩層：

- **P1 窗口內沙盒**：純 DOM 覆蓋層，玩具只在 200×200 寵物窗內（既有 `toy_physics.mjs`）。
- **P3-① 桌面世界**：`canvas` overlay + Matter.js 世界，座標為**螢幕座標**；寵物以 **static proxy body** 參與碰撞，寵物移動時即時更新 proxy 位置，玩具會被寵物彈開。

### 3.2 檔案與職責

| 檔案 | 職責 |
|---|---|
| `renderer/ui/desktop_toys.mjs` | `DesktopToys` 類：世界建立、生成、TTL 回收、cap、proxy 定位、canvas 繪製 |
| `renderer/ui/desktop_toys.html` | overlay 頁面：載入 matter.min.js、canvas 尺寸處理、command/bounds 訂閱、rAF 迴圈 |
| `main/index.js` | `_ensureToyOverlay()`、`_forwardPetBoundsToToys()`、`desktop-toys:request` / `desktop-toys:empty` IPC、`window:move` 轉發、pet 關閉時收 overlay |
| `preload/index.js` | `windowAPI.desktopToys.{request,notifyEmpty,onCommand,onPetBounds}` |
| `renderer/renderer.mjs` | `_desktopToysEnabled` 旗標 + `window._spawnFeedToy()`（依設定分流：桌面 / 窗口內） |
| `renderer/interaction.mjs` | 餵食改呼叫 `window._spawnFeedToy?.()` |
| `renderer/ui/settings.html` | 「Desktop toys (food falls on the desktop)」勾選 → `physics.desktop_toys` |
| `scripts/cdp-desktop-toys-check.mjs` | CDP 端到端檢查（6 項）：尺寸鎖、overlay 建立、玩具存在、掉落受力、proxy 黏合、最後一顆消失後 overlay 自行關閉 |

### 3.3 使用方式

`Settings → Physics → Desktop toys` 勾選後，右鍵餵食會在**桌面**掉下一顆食物（emoji 圓球），落下後會在桌面上滾動、與寵物互相彈開，20 秒後自動消失；最後一顆消失時 overlay 視窗自動關閉（不佔任何資源）。未勾選則維持 P1 的窗口內玩具行為。

### 3.4 測試（`tests/p3_desktop_toys.test.js`，8 項）

掉落受力、落地停棲、玩具數量上限、`setPetBounds` 移動 proxy、TTL 回收 + `onEmpty` 觸發、`onEmpty` 不重複觸發、canvas 繪製、**玩具被寵物 proxy 彈開**。

> 寫測試時踩到一個 Matter.js 陷阱，值得記錄：**直接改寫 `body.position` 不會更新 `body.bounds`**，而 `Collision.collides` 開頭的 `Bounds.overlaps` 前置檢查會因此直接回 null——形狀視覺上明顯重疊卻「沒有碰撞」。搬移 body 必須走 `Body.setPosition`（產品端 `setPetBounds` 原本就是正確的）。

### 3.5 端到端驗證（CDP 驅動真實程式）

單元測試證明「物理世界對」，但證明不了「IPC 接線對」。新增 `scripts/cdp-desktop-toys-check.mjs`（`npm run check:desktop-toys`），用 Chrome DevTools Protocol 驅動**正在執行中的程式**：

```
PASS  pet window keeps its 200x200 size lock  (200x200)
PASS  overlay window was created by the feed action
PASS  overlay world holds one toy  {"alive":1,"limit":8}
PASS  the toy falls under gravity  (y 395.1 -> 611.9)
PASS  pet proxy is glued to the pet window  {"x":1160,"y":640}
PASS  overlay closed itself after the last toy expired
ALL CHECKS PASS
```

啟動方式（switch 必須放在 app 路徑**之前**，否則 Electron 不會開 debug 埠）：

```
node_modules\electron\dist\electron.exe --remote-debugging-port=9222 .
```

### 3.6 D3：overlay 載入競態（真實缺陷，由 CDP 檢查抓出）

**症狀**：proxy 停在 (640, 380) 永不更新，而寵物實際在 (1160, 640)——相差恰好一整個 hop 位移。

**根因**：overlay 視窗剛建立時 renderer 尚未載入完成，`webContents.send()` 的訊息會被直接丟棄。當時寵物正在 hop（`random_move_mode: 'hop'`），第一次轉發的是「寵物當下位置」，而後續每影格的 hop 座標全丟在載入完成前；寵物停下後不再有 `window:move`，於是 proxy **永久停在過期座標**——玩具永遠不會被寵物彈開。

**修法**：
1. 主進程把玩具命令與寵物座標**都**延後到 `did-finish-load` 之後才送出（並以 queue 累積，避免載入期間多次餵食被合成一次）；
2. overlay 頁面啟動時主動 `getPetBounds()` **拉取**一次（push 之外的保底）。

**教訓**：「訊息送達」與「訊息被接收」是兩件事；跨程序窗的初始化順序必須顯式處理，否則症狀會表現成「值錯了幾秒」這種難以定位的形式。

### 3.8 D4：桌面玩具像彈床（真實缺陷，由重複執行抓出）

**症狀**：單元測試單跑 8/8 過，連跑 5 次卻有 2 次掛在「玩具應停在桌面地板」——典型的flaky。

**根因**：地板／牆壁的 `restitution` 是 0.4、玩具是 0.5。玩具從螢幕頂端掉到桌面約 630px，撞擊後保留 45% 動能 → 彈起約 5400px（飛出螢幕），之後反覆彈跳數十秒才停下。**真實的食物掉在桌面幾乎不回彈**，這是產品物理參數寫得不對，不是測試太嚴。

**修法**：牆壁 `restitution` 0.4 → **0.05**（`friction` 0.6），玩具 `restitution` 0.5 → **0.15**（`friction` 0.45、`frictionAir` 0.008）；寵物 proxy 維持 `restitution` 0.6，玩具撞寵物仍然明顯彈開（Matter 取兩者最大值）。測試斷言也從「y 在某區間」改為「已入睡**或**停在地板一個直徑內」。

修完連跑 6 次全過。

**教訓**：flaky 測試不是運氣問題，是**參數沒有被驗證**。沒有重複執行，就會把 40% 失敗率當成 0%。

### 3.9 獨立驗證頁（不依賴 windows_pet 的最終產物）

後續驗證一律收斂到 `pet-physics-test.template.html` → `build-pet-physics-test.ps1` → `pet-physics-test.html`（單檔、可直接用瀏覽器開）。

頁面新增 **P3-① 桌面玩具世界**（頁內等價物，含手動按鈕「🍪 丟食物到桌面」）與 7 項新斷言，總計 **17/17 PASS**：

| 斷言 | 內容 |
|---|---|
| T10 | 桌面玩具受重力掉落 |
| T11 | **D4 回歸**：觸地後反彈高度 < 50px（低回彈，會停下來） |
| T12 | 玩具數量上限 8 |
| T13 | 寵物 proxy 黏合寵物窗口（move 後仍對齊） |
| T14 | 玩具被寵物 proxy 彈開 |
| T15 | TTL 到期回收 → `onEmpty` → overlay 關閉 |
| T16 | **D3 回歸**：世界建立時 proxy 以「當下」寵物座標初始化 |

**斷言必須先證明抓得到缺陷**：把建置產物中的回彈係數改回缺陷值（0.05→0.4、0.15→0.5）後重跑，T11 由 PASS 轉 **FAIL**（反彈高度 83.9px > 門檻），確認守門有效後才交付。

建置腳本的文字門禁（placeholder / `??` / `.flat()` / `export` 殘留）與行為門禁（engine 修復 F1–F6）持續全數通過。

### 3.7 設定檔 BOM 陷阱（非本專案缺陷，但踩過）

用 PowerShell 5.1 的 `Set-Content -Encoding utf8` 寫入設定檔會產生 **UTF-8 BOM**，後端 `config_manager` 直接判定 `Corrupted config file` 並**以預設值覆寫整份檔案**（`physics` 區塊被清掉、靜默失效）。正確寫法：

```powershell
[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))
```


---

## 四、整體回歸

```
Test Suites: 11 passed, 11 total
Tests:       150 passed, 150 total
```

未破壞的既有約束：寵物窗 200×200 尺寸鎖、toast/bubble 聯動、`window:move` IPC 通道、Live2D 載入流程（既有 Live2D vendor 警告為環境噪音，與本次變更無關）。

獨立驗證頁 `pet-physics-test.html` 重建後：頁內 10/10 PASS、fixes-gate 6/6 PASS（Edge headless `--dump-dom` 複驗）。

---

## 五、後續建議

1. 把 soak 納入 CI nightly（8 小時版 `npm run soak:8h`），heap 斜率守門可長期攔截回歸。
2. 桌面玩具可再加「可拖曳」— overlay 目前完全 click-through，若要讓使用者撿起玩具，需要在 overlay 上做滑鼠穿透切換（`setIgnoreMouseEvents(false)` 於 hover 時）。
3. 同一套「量測方法先自證」的作法，可遷移到 Project Hana 的 UVC 確定性回歸（先驗證量測本身能抓已知注入缺陷，再信任它的綠燈）。
