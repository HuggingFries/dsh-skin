#Requires -Version 5.1
<#
.SYNOPSIS
    Uninstall dsh-skin from a DeepSeek Harness web profile.

.DESCRIPTION
    Removes the plugin package from the profile's node_modules directory and
    removes its registration from cordis.patch.yml. Idempotent.

.PARAMETER DshHome
    Harness home directory. Defaults to $env:USERPROFILE\.dsh.

.PARAMETER Profile
    Profile name. Defaults to "web".

.PARAMETER Force
    Skip confirmation prompts.

.EXAMPLE
    .\uninstall.ps1
    .\uninstall.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
    [string]$Profile = 'web',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$pkg = 'dsh-skin'
$target = Join-Path $DshHome "profiles\$Profile\node_modules\$pkg"
$patch = Join-Path $DshHome "profiles\$Profile\cordis.patch.yml"
$enc = New-Object System.Text.UTF8Encoding($false)

Write-Host "==> dsh-skin uninstaller" -ForegroundColor Cyan

# ── 0. preferred path: official `dsh plugin` command ──────────────────────────
$dsh = Get-Command dsh -ErrorAction SilentlyContinue
if ($dsh) {
    $npmrcPath = Join-Path $DshHome "profiles\$Profile\.npmrc"
    if (Test-Path $npmrcPath) {
        $npmrc = Get-Content $npmrcPath -Raw
    } else {
        $npmrc = ''
    }
    if ($npmrc -notmatch 'ignore-workspace-root-check') {
        New-Item -ItemType Directory -Force -Path (Split-Path $npmrcPath) | Out-Null
        Add-Content -Path $npmrcPath -Value "ignore-workspace-root-check=true"
        Write-Host "    enabled workspace-root installs via $npmrcPath"
    }
    Write-Host "    using official 'dsh plugin --profile $Profile remove $pkg' ..."
    dsh plugin --profile $Profile remove $pkg
    if ($LASTEXITCODE -eq 0) {
        Write-Host "==> Done. Restart 'dsh web' to apply." -ForegroundColor Green
        exit 0
    }
    Write-Host "    'dsh plugin remove' failed; falling back to manual cleanup." -ForegroundColor Yellow
}

# ── 1. remove the package directory (manual fallback) ─────────────────────────
if (Test-Path $target) {
    if (-not $Force) {
        $ans = Read-Host "    Remove '$target'? [y/N]"
        if ($ans -notmatch '^[yY]') {
            Write-Host "    aborted." -ForegroundColor Yellow
            exit 0
        }
    }
    $item = Get-Item $target
    if ($item.LinkType) {
        cmd /c rmdir "$target"
    } else {
        Remove-Item $target -Recurse -Force
    }
    Write-Host "    package removed."
} else {
    Write-Host "    package not installed (nothing to remove)." -ForegroundColor Yellow
}

# ── 2. remove the registration block from cordis.patch.yml ────────────────────
if (-not (Test-Path $patch)) {
    Write-Host "    cordis.patch.yml not found; nothing to clean." -ForegroundColor Yellow
    exit 0
}
$lines = [System.IO.File]::ReadAllLines($patch, $enc)
$result = New-Object System.Collections.Generic.List[string]
$removed = $false
$i = 0
while ($i -lt $lines.Length) {
    $line = $lines[$i]
    if ($line.Trim() -match '^- insert:$') {
        # collect this top-level insert block (its indented children)
        $block = New-Object System.Collections.Generic.List[string]
        $j = $i
        while ($j -lt $lines.Length) {
            $bl = $lines[$j]
            if ($j -gt $i -and $bl.Trim() -ne '' -and $bl -notmatch '^[ \t]+') { break }
            $block.Add($bl)
            $j++
        }
        if (($block -join "`n") -match 'dsh-skin') {
            $removed = $true
            # also drop a directly preceding comment line that mentions dsh-skin
            if ($result.Count -gt 0 -and $result[$result.Count - 1].Trim().StartsWith('#')) {
                $result.RemoveAt($result.Count - 1)
            }
        } else {
            foreach ($bl in $block) { $result.Add($bl) }
        }
        $i = $j
    } else {
        $result.Add($line)
        $i++
    }
}

$hasContent = $false
foreach ($r in $result) {
    if ($r.Trim() -ne '' -and -not $r.Trim().StartsWith('#')) { $hasContent = $true; break }
}
if ($removed) {
    if ($hasContent) {
        $newText = (($result | ForEach-Object { $_.TrimEnd() }) -join "`n").TrimEnd() + "`n"
    } else {
        $newText = "[]`n"
    }
    [System.IO.File]::WriteAllText($patch, $newText, $enc)
    Write-Host "    registration removed from cordis.patch.yml."
} else {
    Write-Host "    no dsh-skin registration found in cordis.patch.yml." -ForegroundColor Yellow
}

# ── 3. strip the dependency and bundle entry from package.json (official installs) ──
$manifest = Join-Path $DshHome "profiles\$Profile\package.json"
if (Test-Path $manifest) {
    $pkgJson = [System.IO.File]::ReadAllText($manifest, $enc) | ConvertFrom-Json
    $changed = $false
    if ($pkgJson.dependencies -and $pkgJson.dependencies.PSObject.Properties['dsh-skin']) {
        $pkgJson.dependencies.PSObject.Properties.Remove('dsh-skin')
        $changed = $true
    }
    if ($pkgJson.dsh -and $pkgJson.dsh.profile -and $pkgJson.dsh.profile.bundles -contains $pkg) {
        $pkgJson.dsh.profile.bundles = @($pkgJson.dsh.profile.bundles | Where-Object { $_ -ne $pkg })
        $changed = $true
    }
    if ($changed) {
        [System.IO.File]::WriteAllText($manifest, ($pkgJson | ConvertTo-Json -Depth 6), $enc)
        Write-Host "    dependency and bundle entry removed from package.json."
    }
}

Write-Host "==> Done. Restart 'dsh web' to apply." -ForegroundColor Green
