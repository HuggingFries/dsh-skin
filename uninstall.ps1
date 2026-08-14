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

# ── 1. remove the package ─────────────────────────────────────────────────────
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

Write-Host "==> Done. Restart 'dsh web' to apply." -ForegroundColor Green
