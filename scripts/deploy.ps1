param(
  [switch]$Preview,
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "git is required"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required"
}

Write-Host "Running type check..."
npm run check

$include = @(
  ".gitignore"
  ".env.example"
  "package.json"
  "package-lock.json"
  "tsconfig.json"
  "vercel.json"
  "DAILY_ALMANAC_PLAN.md"
  "api"
  "assets"
  "data"
  "fonts"
  "lib"
  "scripts"
  "tests"
  "NewThings"
)

$include += Get-ChildItem -File -Filter *.html | ForEach-Object { $_.Name }
$include += Get-ChildItem -File -Filter *.md | Where-Object { $_.Name -notlike "SKILL*" } | ForEach-Object { $_.Name }

Write-Host "Staging deployable files..."
git add -- $include

$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host "No staged changes found."
} else {
  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "deploy: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  }
  Write-Host "Committing changes..."
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed"
  }
  Write-Host "Pushing to origin..."
  git push origin HEAD
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed"
  }
}

if (Get-Command vercel -ErrorAction SilentlyContinue) {
  Write-Host "Deploying with Vercel..."
  try {
    if ($Preview) {
      & vercel deploy --yes
    } else {
      & vercel deploy --prod --yes
    }
    if ($LASTEXITCODE -ne 0) {
      throw "vercel deploy failed"
    }
  } catch {
    Write-Warning $_
  }
} else {
  Write-Warning "Vercel CLI is not installed. Push completed; deploy manually if needed."
}
