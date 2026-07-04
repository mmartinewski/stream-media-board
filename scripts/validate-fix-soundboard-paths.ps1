$errors = $null
$tokens = $null
$path = Join-Path $PSScriptRoot 'fix-soundboard-paths.ps1'
[void][System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count -eq 0) {
    Write-Output 'SYNTAX OK'
    exit 0
}
foreach ($err in $errors) {
    Write-Output $err.ToString()
}
exit 1
