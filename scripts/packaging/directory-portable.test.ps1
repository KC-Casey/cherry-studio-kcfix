$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem
$workspace = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $workspace | Out-Null
try {
  $source = Join-Path $workspace 'win-unpacked'
  # Match Electron 45: no standalone ANGLE DLLs are shipped or required.
  $files = @(
    'cherry-studio-kcfix.exe', 'resources/app.asar', 'icudtl.dat', 'resources.pak',
    'ffmpeg.dll', 'locales/en-US.pak', 'locales/zh-CN.pak',
    'resources/computer-use/open-computer-use.exe',
    'resources/app.asar.unpacked/node_modules/@aiany/sqlite-vec-windows-x64/vec0.dll',
    'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
    'resources/.hidden/dependency.bin', 'resources/hidden-file.bin', 'resources/中文 dependency.bin'
  )
  foreach ($relative in $files) {
    $file = Join-Path $source $relative
    New-Item -ItemType Directory -Path (Split-Path $file) -Force | Out-Null
    Set-Content -LiteralPath $file -Value "fixture bytes: $relative" -Encoding utf8NoBOM
  }
  if ($IsWindows) {
    $hidden = Get-Item -LiteralPath "$source/resources/hidden-file.bin"
    $hidden.Attributes = $hidden.Attributes -bor [IO.FileAttributes]::Hidden
  }
  $output = Join-Path $workspace 'release'
  $arguments = @{ SourceDirectory = $source; OutputDirectory = $output; Version = '2.1.11-kcfix.2'; Commit = ('a' * 40); RunId = '123' }
  & "$PSScriptRoot/directory-portable.ps1" @arguments
  $name = 'cherry-studio-kcfix-2.1.11-kcfix.2-win-x64-portable'
  $archive = [IO.Compression.ZipFile]::OpenRead("$output/$name.zip")
  try {
    foreach ($relative in $files + @('README.txt', 'cherry-portable.json')) {
      if (!$archive.GetEntry("$name/$relative")) { throw "Missing complete-tree ZIP entry: $relative" }
    }
    $reader = [IO.StreamReader]::new($archive.GetEntry("$name/cherry-portable.json").Open())
    try { $marker = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    if ($marker.format -ne 1) { throw 'Invalid portable marker contract' }
    if ($archive.GetEntry("$name/data/") -or $archive.GetEntry("$name.exe")) { throw 'Unexpected profile or self-extractor' }
  } finally { $archive.Dispose() }
  $assets = @(Get-ChildItem -LiteralPath $output -File)
  if ($assets.Count -ne 3 -or @(Get-Content "$output/SHA256SUMS").Count -ne 2) { throw 'Wrong release asset/checksum count' }
  $readme = Get-Content -LiteralPath "$output/README.txt" -Raw
  if (!$readme.Contains('/commit/' + ('a' * 40)) -or !$readme.Contains('2.1.11-kcfix.2')) { throw 'Missing provenance' }

  # Missing dependencies and accidental profile inclusion must stop publication.
  foreach ($scenario in @('missing-asar', 'missing-native', 'user-data', 'existing-output')) {
    $arguments.OutputDirectory = Join-Path $workspace $scenario
    switch ($scenario) {
      'missing-asar' { Move-Item "$source/resources/app.asar" "$workspace/app.asar"; $expected = 'Missing or empty packaged dependency:*' }
      'missing-native' { Move-Item "$source/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node" "$workspace/better_sqlite3.node"; $expected = 'Missing packaged better-sqlite3*' }
      'user-data' { New-Item -ItemType Directory -Path "$source/data" | Out-Null; $expected = 'User data must not ship:*' }
      'existing-output' { $arguments.OutputDirectory = $output; $expected = 'Refusing to overwrite*' }
    }
    $rejected = $false
    try { & "$PSScriptRoot/directory-portable.ps1" @arguments }
    catch { if ($_.Exception.Message -notlike $expected) { throw }; $rejected = $true }
    if (!$rejected) { throw "Packaging unexpectedly accepted: $scenario" }
    switch ($scenario) {
      'missing-asar' { Move-Item "$workspace/app.asar" "$source/resources/app.asar" }
      'missing-native' { Move-Item "$workspace/better_sqlite3.node" "$source/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node" }
      'user-data' { Remove-Item -LiteralPath "$source/data" }
    }
  }
  Write-Host 'Directory portable contracts passed: complete dependency tree, hidden files, marker, provenance, clean data, fail-closed inputs.'
} finally { Remove-Item -LiteralPath $workspace -Recurse -Force }
