#Requires -Version 5.1
<#
.SYNOPSIS
    Install dsh-skin into a DeepSeek Harness web profile.

.DESCRIPTION
    Copies the plugin package into the profile's node_modules directory and
    registers it in cordis.patch.yml. Idempotent: safe to run repeatedly.

.PARAMETER DshHome
    Harness home directory. Defaults to $env:USERPROFILE\.dsh.

.PARAMETER Profile
    Profile name. Defaults to "web".

.PARAMETER Force
    Overwrite an existing plugin copy without prompting.

.EXAMPLE
    .\install.ps1
    .\install.ps1 -DshHome C:\dsh-home -Force
#>
[CmdletBinding()]
param(
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
    [string]$Profile = 'web',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$pkg = 'dsh-skin'
$src = $PSScriptRoot
$nodeModules = Join-Path $DshHome "profiles\$Profile\node_modules"
$target = Join-Path $nodeModules $pkg
$patch = Join-Path $DshHome "profiles\$Profile\cordis.patch.yml"
$enc = New-Object System.Text.UTF8Encoding($false)

Write-Host "==> dsh-skin installer" -ForegroundColor Cyan
Write-Host "    source : $src"
Write-Host "    target : $target"

if (-not (Test-Path (Join-Path $src 'package.json'))) {
    throw "package.json not found next to this script. Run install.ps1 from the repository root."
}

# ── 0. preferred path: official `dsh plugin` command (bundle install) ─────────
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if ($dsh) {
    Write-Host "    using official 'dsh plugin --profile $Profile add <repo> ...'"
    dsh plugin --profile $Profile add $src
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> Done. Restart 'dsh web' to load the plugin." -ForegroundColor Green
        exit 0
    }
    Write-Host "    'dsh plugin add' failed (missing pnpm or profile?); falling back to manual install." -ForegroundColor Yellow
}

# ── 1. copy the package (idempotent) ──────────────────────────────────────────
if (Test-Path $target) {
    if (-not $Force) {
        $ans = Read-Host "    '$pkg' already installed. Overwrite? [y/N]"
        if ($ans -notmatch '^[yY]') {
            Write-Host "    skipped package copy." -ForegroundColor Yellow
        } else {
            $Force = $true
        }
    }
    if ($Force) {
        $item = Get-Item $target
        if ($item.LinkType) {
            cmd /c rmdir "$target"
        } else {
            Remove-Item $target -Recurse -Force
        }
        Write-Host "    removed previous copy."
    }
}
if (-not (Test-Path $target)) {
    New-Item -ItemType Directory -Force -Path $nodeModules | Out-Null
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item (Join-Path $src 'package.json') $target -Force
    Copy-Item (Join-Path $src 'lib') (Join-Path $target 'lib') -Recurse -Force
    foreach ($doc in @('README.md', 'README.zh-CN.md', 'INSTALL.md', 'LICENSE')) {
        $docPath = Join-Path $src $doc
        if (Test-Path $docPath) { Copy-Item $docPath $target -Force }
    }
    Write-Host "    package copied."
}

# ── 2. register in cordis.patch.yml (idempotent) ──────────────────────────────
if (Test-Path $patch) {
    $text = [System.IO.File]::ReadAllText($patch, $enc)
} else {
    $text = ''
}
if ($text -match '(?m)^\s*- id:\s*dsh-skin\s*$') {
    Write-Host "    already registered in cordis.patch.yml." -ForegroundColor Yellow
} else {
    $block = @"
# dsh-skin — visual customization plugin for DeepSeek Harness
- insert:
    - id: dsh-skin
      name: 'dsh-skin'
      inject: [webServer, fs]
"@
    if ($text.Trim() -eq '') {
        $newText = $block.TrimStart() + "`n"
    } else {
        # replace a bare top-level "[]" (the default empty patch) with the block,
        # otherwise append the block as a new top-level entry
        $lines = $text -split "`n"
        $replaced = $false
        for ($i = 0; $i -lt $lines.Length; $i++) {
            if ($lines[$i].Trim() -eq '[]') {
                $lines[$i] = $block.TrimStart()
                $replaced = $true
                break
            }
        }
        if ($replaced) {
            $newText = ($lines -join "`n").TrimEnd() + "`n"
        } else {
            $newText = $text.TrimEnd() + "`n" + $block + "`n"
        }
    }
    [System.IO.File]::WriteAllText($patch, $newText, $enc)
    Write-Host "    registered in cordis.patch.yml."
}

Write-Host "==> Done. Restart 'dsh web' to load the plugin." -ForegroundColor Green
