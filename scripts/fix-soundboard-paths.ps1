# Corrige caminhos absolutos no storage.db apos migrar LocalSoundboardServer
# entre PCs ou usuarios Windows diferentes.
#
# Nao precisa instalar sqlite3 se voce usar o DB Browser for SQLite.
# O script sempre gera um .sql em %TEMP%; com sqlite3 no PATH, aplica sozinho.
#
# Uso (app fechado):
#   powershell -ExecutionPolicy Bypass -File scripts\fix-soundboard-paths.ps1
#
# Se nao tiver sqlite3, informe o caminho antigo:
#   powershell -ExecutionPolicy Bypass -File scripts\fix-soundboard-paths.ps1 -OldPrefix "C:\Users\Antigo\AppData\Roaming\LocalSoundboardServer"

param(
    [string]$AppData = "$env:APPDATA\LocalSoundboardServer",
    [string]$OldPrefix = "",
    [string]$SqlOutPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Escape-SqlLiteral {
    param([string]$Value)
    return $Value.Replace("'", "''")
}

function Invoke-Sqlite3 {
    param(
        [string]$DatabasePath,
        [string[]]$Arguments
    )
    $sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if (-not $sqlite3) {
        return $null
    }
    $output = & $sqlite3.Source $DatabasePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "sqlite3 falhou (exit code $LASTEXITCODE)."
    }
    return $output
}

$dbPath = Join-Path $AppData "database\storage.db"
if (-not (Test-Path -LiteralPath $dbPath)) {
    throw "Banco nao encontrado: $dbPath"
}

if ([string]::IsNullOrWhiteSpace($OldPrefix)) {
    $sample = Invoke-Sqlite3 -DatabasePath $dbPath -Arguments @(
        "SELECT audio_path FROM clips WHERE audio_path IS NOT NULL AND audio_path != '' LIMIT 1;"
    )
    if ($null -eq $sample) {
        throw @"
Informe o caminho antigo com -OldPrefix.

Exemplo:
  powershell -ExecutionPolicy Bypass -File "$PSCommandPath" -OldPrefix "C:\Users\Antigo\AppData\Roaming\LocalSoundboardServer"

Para descobrir o caminho antigo sem sqlite3:
  1. Instale DB Browser for SQLite (https://sqlitebrowser.org/dl/)
  2. Abra: $dbPath
  3. Browse Data -> clips -> coluna audio_path
  4. Copie tudo antes de \media\audio\
"@
    }
    if ([string]::IsNullOrWhiteSpace($sample)) {
        Write-Host "Nenhum clipe com audio_path - nada a corrigir."
        exit 0
    }
    $OldPrefix = ([string]$sample).Trim() -replace '\\media\\audio\\.*$', ''
}

$newPrefix = $AppData
Write-Host "Antigo: $OldPrefix"
Write-Host "Novo:   $newPrefix"

if ($OldPrefix -eq $newPrefix) {
    Write-Host "Caminhos ja estao corretos."
    exit 0
}

$oldEsc = Escape-SqlLiteral $OldPrefix
$newEsc = Escape-SqlLiteral $newPrefix

$sqlTemplate = @'
UPDATE clips SET
  audio_path = REPLACE(audio_path, '{0}', '{1}'),
  video_path = REPLACE(video_path, '{0}', '{1}'),
  thumbnail_original_path = REPLACE(thumbnail_original_path, '{0}', '{1}'),
  thumbnail_cropped_path = REPLACE(thumbnail_cropped_path, '{0}', '{1}');

UPDATE categories SET
  thumbnail_original_path = REPLACE(thumbnail_original_path, '{0}', '{1}'),
  thumbnail_cropped_path = REPLACE(thumbnail_cropped_path, '{0}', '{1}');

UPDATE media_search_cache SET
  media_path = REPLACE(media_path, '{0}', '{1}'),
  preview_path = REPLACE(preview_path, '{0}', '{1}');
'@

$sqlText = [string]::Format($sqlTemplate, $oldEsc, $newEsc)
if ([string]::IsNullOrWhiteSpace($SqlOutPath)) {
    $SqlOutPath = Join-Path $env:TEMP "fix-soundboard-paths.sql"
}
[System.IO.File]::WriteAllText($SqlOutPath, $sqlText, [System.Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "SQL salvo em:"
Write-Host "  $SqlOutPath"
Write-Host ""

$sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (-not $sqlite3) {
    Write-Host "sqlite3 nao esta instalado. Use o DB Browser (nao precisa instalar sqlite3):"
    Write-Host ""
    Write-Host "  1. Baixe: https://sqlitebrowser.org/dl/"
    Write-Host "  2. Abra o banco: $dbPath"
    Write-Host "  3. Aba Execute SQL -> File -> Open SQL file"
    Write-Host "  4. Selecione: $SqlOutPath"
    Write-Host "  5. Run (play) -> Write Changes (salvar)"
    Write-Host ""
    Write-Host "Ou instale sqlite3 e rode este script de novo:"
    Write-Host "  winget install SQLite.SQLite"
    Write-Host ""
    exit 0
}

try {
    & $sqlite3.Source $dbPath ".read `"$SqlOutPath`""
    if ($LASTEXITCODE -ne 0) {
        throw "sqlite3 falhou (exit code $LASTEXITCODE)."
    }
    Write-Host "Pronto. Abra o app e teste um clipe."
}
catch {
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "O SQL ja foi salvo em $SqlOutPath"
    Write-Host "Aplique manualmente no DB Browser for SQLite."
    exit 1
}
