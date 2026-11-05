param(
  [Parameter(Mandatory = $true)][string]$ArtifactZip,
  [Parameter(Mandatory = $true)][string]$RunDirectory
)
$ErrorActionPreference = 'Stop'
$artifact = (Resolve-Path $ArtifactZip).Path
if (Test-Path $RunDirectory) { throw 'Run directory must be new and empty' }
$run = [System.IO.Path]::GetFullPath($RunDirectory)
$sha = (git rev-parse HEAD).Trim()
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
function Invoke-Controller {
  & pnpm exec tsx scripts/e2e/regression/cli.ts @args
  if ($LASTEXITCODE -ne 0) { throw "Regression controller failed: $args" }
}
Invoke-Controller preflight --task painting-workbench
Invoke-Controller initialize --run-dir $run --mode tag --platform windows --task painting-workbench --ref "v$version" --sha $sha --runner windows-packaged
try {
  $installed = Join-Path $run 'installed/workbench'
  New-Item -ItemType Directory -Path $installed -Force | Out-Null
  Expand-Archive -Path $artifact -DestinationPath $installed
  $markers = @(Get-ChildItem -Path $installed -Filter 'cherry-portable.json' -File -Recurse)
  if ($markers.Count -ne 1) { throw 'Portable ZIP must contain exactly one portable marker' }
  $appDirectory = $markers[0].DirectoryName
  if (Test-Path (Join-Path $appDirectory 'data')) { throw 'Release ZIP must not contain user data' }
  $executables = @(Get-ChildItem -Path $appDirectory -Filter '*.exe' -File | Where-Object { $_.Name -notmatch '^unins|^Uninstall' })
  if ($executables.Count -ne 1) { throw 'Expected exactly one application executable in packaged directory' }
  $executable = $executables[0].FullName
  $record = @{
    artifactName = [System.IO.Path]::GetFileName($artifact)
    artifactPath = $artifact
    artifactSha256 = (Get-FileHash -Algorithm SHA256 $artifact).Hash.ToLowerInvariant()
    executablePath = $executable
    installedPath = $appDirectory
  }
  $record | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $run 'release/installation.json')
  $runStatePath = Join-Path $run 'run.json'
  $runState = Get-Content $runStatePath -Raw | ConvertFrom-Json
  $runState.metadata | Add-Member -NotePropertyName artifactName -NotePropertyValue $record.artifactName -Force
  $runState.metadata | Add-Member -NotePropertyName artifactSha256 -NotePropertyValue $record.artifactSha256 -Force
  $runState | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 $runStatePath
  Invoke-Controller launch --run-dir $run --target-root (Get-Location).Path --run-key "workbench-$sha"
  Invoke-Controller run-phase --run-dir $run --phase images
  Invoke-Controller finalize --run-dir $run
  Invoke-Controller gate --run-dir $run
} finally {
  & pnpm exec tsx scripts/e2e/regression/cli.ts finalize --run-dir $run
  & pnpm exec tsx scripts/e2e/regression/cli.ts cleanup --run-dir $run
}
