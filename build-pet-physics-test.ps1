# build-pet-physics-test.ps1
# Regenerate pet-physics-test.html (the standalone P0 verification page).
#
# Inputs:
#   - pet-physics-test.template.html        page template (placeholders)
#   - vendor\matter.min.js                 Matter.js engine (vendored copy;
#                                           falls back to matter-js-test\build\)
#   - vendor\physics_host.mjs              P0 physics module (vendored copy);
#                                           falls back to the windows_pet checkout
#     The P0 module is embedded VERBATIM except: leading `export ` stripped
#     and old-browser syntax downleveled (?? -> == null ternary,
#     .flat() -> concat()) — behaviour-identical.
#
# Override the physics module location with PET_PHYSICS_HOST (used by CI).
#
# Usage:  powershell -ExecutionPolicy Bypass -File build-pet-physics-test.ps1

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$TPL    = Join-Path $PSScriptRoot 'pet-physics-test.template.html'
$LIB_LOCAL = Join-Path $PSScriptRoot 'vendor\matter.min.js'
$LIB    = if (Test-Path $LIB_LOCAL) { $LIB_LOCAL } else { Join-Path $PSScriptRoot 'matter-js-test\build\matter.min.js' }
$PHYS_LOCAL = Join-Path $PSScriptRoot 'vendor\physics_host.mjs'
$PHYS_DEFAULT = 'C:\Users\Admin\Documents\openhanako\windows_pet\electron\renderer\physics_host.mjs'
$PHYS  = if ($env:PET_PHYSICS_HOST) { $env:PET_PHYSICS_HOST }
         elseif (Test-Path $PHYS_LOCAL) { $PHYS_LOCAL }
         else { $PHYS_DEFAULT }
$OUTPUT = Join-Path $PSScriptRoot 'pet-physics-test.html'

if (-not (Test-Path $PHYS)) {
    Write-Host "GATE FAILED: physics_host.mjs not found at $PHYS"
    Write-Host "  set PET_PHYSICS_HOST=<path> or place a copy in vendor\physics_host.mjs"
    exit 1
}

$tpl = Get-Content -Raw -Encoding UTF8 $TPL

# 1. Matter.js — neutralize any literal </script> so the inline block survives
$lib = Get-Content -Raw -Encoding UTF8 $LIB
$lib = $lib.Replace('</script>', '<\/script>')

# 2. physics_host.mjs — strip export keywords, neutralize, then downlevel
$src = Get-Content -Raw -Encoding UTF8 $PHYS
$src = $src.Replace('</script>', '<\/script>')
$src = [regex]::Replace($src, '(?m)^export ', '')
$src = $src.Replace('opts.pxPerStep ?? (1000 / 60)',    '(opts.pxPerStep == null ? (1000 / 60) : opts.pxPerStep)')
$src = $src.Replace('opts.maxSpeed ?? MAX_THROW_SPEED', '(opts.maxSpeed == null ? MAX_THROW_SPEED : opts.maxSpeed)')
$src = $src.Replace('opts.minSpeed ?? THROW_MIN_SPEED', '(opts.minSpeed == null ? THROW_MIN_SPEED : opts.minSpeed)')
$src = $src.Replace('s.availLeft ?? 0',    '(s.availLeft == null ? 0 : s.availLeft)')
$src = $src.Replace('s.availTop ?? 0',     '(s.availTop == null ? 0 : s.availTop)')
$src = $src.Replace('s.availWidth ?? 1920', '(s.availWidth == null ? 1920 : s.availWidth)')
$src = $src.Replace('s.availHeight ?? 1040', '(s.availHeight == null ? 1040 : s.availHeight)')
$src = $src.Replace('[this._walls, this.body].flat()', 'this._walls.concat([this.body])')

# 3. Assemble
$out = $tpl.Replace('/*__MATTER_JS__*/', $lib).Replace('/*__PHYSICS_HOST__*/', $src)
[System.IO.File]::WriteAllText($OUTPUT, $out, [System.Text.UTF8Encoding]::new($false))

# 4. Verify
$ph = [int]($out.Contains('__MATTER_JS__') -or $out.Contains('__PHYSICS_HOST__'))
$nul = [regex]::Matches($out, [regex]::Escape('??')).Count
$flt = [regex]::Matches($out, [regex]::Escape('.flat(')).Count
$exp = [regex]::Matches($out, '(?m)^export ').Count
$len = (Get-Item $OUTPUT).Length
Write-Host "built: $OUTPUT ($len bytes)"
Write-Host "placeholders-left : $ph"
Write-Host "nullish-left      : $nul"
Write-Host "flat-left         : $flt"
Write-Host "export-left       : $exp"

# 4b. Text gate — assert the counters, don't just print them.
#     nullish baseline is 1: the only `??` that may survive is the one inside
#     Matter's own feature probe, `new Function('return (null ?? 1)')`. A second
#     one means a new `??` in physics_host.mjs slipped past the downleveling
#     rules above (each rule is an exact-string match, so it fails silently).
$NULLISH_BASELINE = 1
if ($ph -ne 0 -or $flt -ne 0 -or $exp -ne 0 -or $nul -ne $NULLISH_BASELINE) {
    Write-Host "GATE FAILED: residual tokens (placeholder=$ph flat=$flt export=$exp nullish=$nul/$NULLISH_BASELINE)"
    exit 1
}

# 5. Behavioural gate — the four counters above only prove the text was spliced.
#    This proves the *shipped bundle* actually carries all six engine fixes
#    (F1 compound inertia .. F6 sleeping compound pairs) by exercising it.
$probe = Join-Path $PSScriptRoot 'probe_bundle_fixcheck.js'
if (-not (Test-Path $probe)) {
    Write-Host 'fixes-gate        : SKIPPED (probe_bundle_fixcheck.js not found)'
    exit 0
}
$res = (& node $probe $OUTPUT 2>&1 | Out-String)
Write-Host $res.TrimEnd()
if ($res -notmatch '(\d+)/6 pass') {
    Write-Host 'fixes-gate        : FAIL (probe output unparseable)'
    exit 1
}
$fixes = [int]$Matches[1]
Write-Host "fixes-gate        : $fixes/6 pass"
if ($fixes -ne 6) {
    Write-Host 'FIXES-GATE FAILED — shipped bundle is missing engine fixes; do not hand this page out.'
    exit 1
}
