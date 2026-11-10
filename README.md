# pet-physics-test â€” æ¡Œé¢å¯µç‰©ç†ç¨ç«‹é©—è­‰é 

å–®æª”ã€é›¶ä¾è³´çš„ç¨ç«‹æ¸¬è©¦ç¨‹åºï¼šä¸å•Ÿå‹• Electronã€ä¸ä¾è³´ windows_pet å°±èƒ½é©—è­‰æ¡Œé¢å¯µç‰©çš„ç‰©ç†èªžç¾©ã€‚
ç›´æŽ¥ç”¨ç€è¦½å™¨é–‹å•Ÿ `pet-physics-test.html` å³å¯ï¼ˆ140KBï¼Œå…§åµŒ Matter.js èˆ‡ P0 `physics_host.mjs`ï¼‰ã€‚

## è¦†è“‹ç¯„åœ

| å€å¡Š | å…§å®¹ |
|---|---|
| P0 æ‹‹æ“² | æ…¢é€Ÿé‡‹æ”¾ï¼æ”¾ç½®ã€å¿«é€Ÿç”©å‡ºï¼ç‰©ç† episodeï¼ˆæ‹‹ç‰©ç·š â†’ è½åœ° â†’ å…¥ç¡ï¼‰ã€grab æ¶å ã€F5 reset è­·æ¬„ã€æ‹–æ‹½å¤¾ç·Šã€ç”©å‡ºéš¨æ©Ÿæ€§ |
| P3-â‘  æ¡Œé¢çŽ©å…· | æ¡Œé¢åº§æ¨™çš„çŽ©å…·ä¸–ç•Œã€å¯µç‰©ä»¥ static proxy åƒèˆ‡ç¢°æ’žã€çŽ©å…·ä¸Šé™ 8ã€TTL 20 ç§’ã€ä½Žå›žå½ˆï¼ˆæœƒåœä¸‹ä¾†ï¼‰ |

é å…§è‡ªå‹•æ¸¬è©¦å…± **17 é …**ï¼Œè¼‰å…¥æ™‚è‡ªå‹•åŸ·è¡Œä¸¦åœ¨è¡¨æ ¼ä¸­åˆ—å‡ºçµæžœã€‚

## å…©é …å¯¦æ©Ÿç¼ºé™·çš„å›žæ­¸æ–·è¨€

- **T11ï¼ˆä½Žå›žå½ˆï¼‰**ï¼šé‡ã€Œè§¸åœ°å¾Œçš„åå½ˆé«˜åº¦ã€< 50pxã€‚ç¼ºé™·å€¼ï¼ˆç‰†å£ 0.4 / çŽ©å…· 0.5ï¼‰æœƒè®“çŽ©å…·åƒå½ˆåºŠä¸€æ¨£é£›å‡ºç•«é¢ï¼Œåå½ˆé«˜åº¦ ~84px â†’ æ–·è¨€è½‰ç´…ã€‚
- **T16ï¼ˆåˆå§‹åŒ–ç«¶æ…‹ï¼‰**ï¼šä¸–ç•Œå»ºç«‹æ™‚å¯µç‰© proxy å¿…é ˆä»¥ã€Œç•¶ä¸‹ã€å¯µç‰©åº§æ¨™åˆå§‹åŒ–ã€‚æŽ¨é€å¼æ›´æ–°è‹¥æ™šåˆ°ï¼Œproxy æœƒæ°¸ä¹…åœåœ¨éŽæœŸåº§æ¨™ï¼ŒçŽ©å…·å†ä¹Ÿä¸æœƒè¢«å¯µç‰©å½ˆé–‹ã€‚

## å»ºç½®

```powershell
.\build-pet-physics-test.ps1
```

è…³æœ¬æœƒæŠŠ `pet-physics-test.template.html` èˆ‡å…©å€‹ä¾†æºçµ„è£æˆå–®æª”ï¼Œä¸¦è·‘å…©é“é–€ç¦ï¼š

1. **æ–‡å­—é–€ç¦** â€” ä¸å¾—æ®˜ç•™ `/*__MATTER_JS__*/`ã€`??`ï¼ˆåŸºç·š 1ï¼Œæ˜¯ Matter è‡ªå·±çš„ feature probeï¼‰ã€`.flat()`ã€`export `ã€‚
2. **è¡Œç‚ºé–€ç¦**ï¼ˆ`probe_bundle_fixcheck.js`ï¼‰â€” ç›´æŽ¥è·‘çµ„è£å¾Œçš„ bundleï¼Œé©—è­‰ engine ä¿®å¾© F1â€“F6 éƒ½åœ¨ã€‚

### è¼¸å…¥ä¾†æº

| ä¾†æº | ä½ç½® |
|---|---|
| Matter.js | `vendor/matter.min.js`ï¼ˆç„¡æ­¤æª”æ™‚é€€å›ž `matter-js-test\build\matter.min.js`ï¼‰ |
| P0 ç‰©ç†æ¨¡çµ„ | `C:\Users\Admin\Documents\openhanako\windows_pet\electron\renderer\physics_host.mjs`ï¼ˆé€å­—åµŒå…¥ï¼Œåƒ…é™ç´šèˆŠç€è¦½å™¨èªžæ³•ï¼‰ |

`physics_host.mjs` è‹¥è¦ç¨ç«‹æ–¼ windows_petï¼Œå¯è‡ªè¡Œæ”¾åˆ° `vendor\physics_host.mjs` ä¸¦ä¿®æ”¹è…³æœ¬ä¸­çš„ `$PHYS`ã€‚

## é©—è­‰

```powershell
# é å…§ 17 é … + fixes-gate 6/6
.\build-pet-physics-test.ps1
```

ç€è¦½å™¨é©—è­‰ï¼ˆEdge headlessï¼‰ï¼š

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --disable-gpu `
  --dump-dom --virtual-time-budget=10000 "file:///$PWD/pet-physics-test.html"
```

è¡¨æ ¼ä¸­ `class="pass"` / `class="fail"` çš„åˆ—æ•¸å³ç‚ºçµæžœã€‚

## å®ˆé–€å¿…é ˆå…ˆè­‰æ˜ŽæŠ“å¾—åˆ°ç¼ºé™·

ä¸€å€‹å¾žæ²’ç´…éŽçš„æ–·è¨€ä¸ç­‰æ–¼å®ˆé–€ï¼šæ”¹å£žåƒæ•¸é‡è·‘ï¼Œç¢ºèªå°æ‡‰æ–·è¨€è½‰ç´…å¾Œï¼Œæ‰ä¿¡ä»»ç¶ ç‡ˆã€‚

```powershell
# æ³¨å…¥ D4 ç¼ºé™·å€¼ â†’ é æœŸ T11 è½‰ FAILï¼ˆ16/17ï¼‰
$s = Get-Content pet-physics-test.html -Raw `
  -replace 'restitution: 0\.05','restitution: 0.4' `
  -replace 'restitution: 0\.15','restitution: 0.5'
[System.IO.File]::WriteAllText("$PWD\probe.html", $s, (New-Object System.Text.UTF8Encoding($false)))
```

## ç›¸é—œ

- windows_pet ç«¯å°æ‡‰å¯¦ä½œèˆ‡æ¸¬è©¦ï¼š`electron/renderer/ui/desktop_toys.mjs`ã€`electron/tests/p3_desktop_toys.test.js`ã€`electron/scripts/cdp-desktop-toys-check.mjs`
- Matter.js åˆ†å±¤æ¸¬è©¦èˆ‡ engine ä¿®å¾©ï¼š`davncl-star/matter-js`ï¼ˆåˆ†æ”¯ `layered-physics-tests`ï¼‰

## CI

`.github/workflows/verify.yml`ï¼ˆwindows-latestï¼‰ï¼š

1. å»ºç½®å–®æª”é ï¼ˆæ–‡å­—é–€ç¦ + engine ä¿®å¾©è¡Œç‚ºé–€ç¦ F1â€“F6ï¼‰
2. ç”¨é è£çš„ Edge headless åŸ·è¡Œé å…§æ–·è¨€ï¼Œå‡ºç¾ä»»ä½• FAIL å³å¤±æ•—

> `vendor/physics_host.mjs` æ˜¯ windows_pet çš„ P0 ç‰©ç†æ¨¡çµ„å‰¯æœ¬ï¼ˆwindows_pet ç‚ºç§æœ‰å€‰åº«ï¼Œæœ¬å€‰åº«éœ€è¦èƒ½ç¨ç«‹å»ºç½®ï¼‰ã€‚è‹¥è¦æ”¹ç”¨æ›´æ–°ç‰ˆæœ¬ï¼Œè¨­ç’°å¢ƒè®Šæ•¸ `PET_PHYSICS_HOST` æŒ‡å‘å®ƒå³å¯ï¼›CI äº¦åŒã€‚

