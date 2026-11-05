param(
  [Parameter(Mandatory)][string]$SourceDirectory,
  [Parameter(Mandatory)][string]$OutputDirectory,
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$Commit,
  [Parameter(Mandatory)][string]$RunId
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression.FileSystem

$source = (Resolve-Path -LiteralPath $SourceDirectory).Path
$name = "cherry-studio-kcfix-$Version-win-x64-portable"
# Electron 45 statically links ANGLE and deliberately omits libEGL/libGLESv2.
# See electron/electron v45.2.2 build/zip.py; do not require those unused stubs.
$required = @(
  'cherry-studio-kcfix.exe', 'resources/app.asar', 'icudtl.dat', 'resources.pak',
  'ffmpeg.dll', 'locales/en-US.pak', 'locales/zh-CN.pak',
  'resources/computer-use/open-computer-use.exe',
  'resources/app.asar.unpacked/node_modules/@aiany/sqlite-vec-windows-x64/vec0.dll'
)
foreach ($relative in $required) {
  $file = Join-Path $source $relative
  if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -eq 0) {
    throw "Missing or empty packaged dependency: $relative"
  }
}
if (!(Get-ChildItem -LiteralPath "$source/resources/app.asar.unpacked" -Recurse -Force -File -Filter better_sqlite3.node)) {
  throw 'Missing packaged better-sqlite3 native module'
}
foreach ($relative in @('data', 'userData', '.cherrystudio', 'boot-config.json')) {
  if (Test-Path -LiteralPath (Join-Path $source $relative)) { throw "User data must not ship: $relative" }
}
if (Get-ChildItem -LiteralPath $source -Force -Recurse | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
  throw 'Unexpected reparse point in packaged application'
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Refusing to overwrite an existing release directory' }
$output = (New-Item -ItemType Directory -Path $OutputDirectory).FullName
$stage = Join-Path ([IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stage | Out-Null
try {
  $root = Join-Path $stage $name
  # Copy the directory itself, not a wildcard that can omit hidden entries.
  Copy-Item -LiteralPath $source -Destination $root -Recurse -Force
  Set-Content -LiteralPath "$root/cherry-portable.json" -Value '{"format":1}' -Encoding utf8NoBOM
  @"
cherry-studio-kcfix $Version | Windows x64 directory portable preview
Source: https://github.com/KC-Casey/cherry-studio-kcfix/commit/$Commit
Build: https://github.com/KC-Casey/cherry-studio-kcfix/actions/runs/$RunId

中文使用说明
1. 将 ZIP 完整解压到新的可写目录，打开 $name 文件夹，运行 cherry-studio-kcfix.exe。
   无需安装。必须保留 EXE、resources、locales、DLL 和 cherry-portable.json，不可只移动 EXE。
   这是完整程序目录，不是每次启动先解压的 NSIS 自解压 EXE。不会因此保证所有功能零延迟。
2. 测试前备份已有数据。不要覆盖旧程序或旧数据目录；旧版 Release 保留供回退。
   默认使用 EXE 同级 data 目录，但 ~/.cherrystudio/boot-config.json 的已有数据映射仍可能覆盖它。
   此版本不是隔离配置，勿同时用新旧版本打开同一数据；回退时使用升级前备份。
3. 主数据迁移：设置→数据→数据目录→应用数据→修改目录。选择新的空文件夹并等待复制及重启。
   不要手动覆盖数据目录。迁移不代表完全不使用 C 盘，启动配置、临时文件或组件缓存仍可能在 C 盘。
4. 移动整个程序目录后，请重新设置开机启动或更新快捷方式，避免继续指向旧位置。
   本版本未签名，Windows 可能提示安全警告。先核对 SHA256SUMS 和来源，再按自己的安全判断决定是否运行。
   可在 PowerShell 中执行 Get-FileHash .\$name.zip -Algorithm SHA256 核对校验值。

本次模型信息识别更新
- 新增 GPT Image 2.6 精确目录；新添加的已知模型可继承已验证的模态和能力。目录缺失的限制及价格保持未知，不代表免费。
- 新添加的未知模型可采用 Gemini/OpenRouter 返回的已验证结构化元数据；不会根据陌生模型名字猜能力，也不会定期覆盖既有自定义配置。
- 已有模型保持原样。需要采用目录信息时，到 设置→模型服务→编辑模型→自动模型信息，点击“使用目录默认配置”并确认。
  此操作会一起恢复能力、输入/输出模态、令牌限制、流式支持、参数、推理及价格；保留模型身份、名称、分组、接口和启用状态。恢复后仍可手动覆盖。
- 目录说明模型支持，不保证具体中转服务、账户权限或接口路由可用；真实服务商仍需实测。

保留的图片工作台修复
- 选中的输出图保留为下一轮父图；输入本轮指令即可继续编辑，点左侧任意旧图可分叉。
- 左侧显示父子谱系，中间保留缩放、旋转及改前/改后对比，右侧区分只读生成记录和下一轮参数。
- 灰色发送按钮会解释原因。仅在服务商确实支持图片编辑时，到 设置→模型服务→编辑模型→更多设置→输入模态 启用视觉；或选择已支持编辑的模型。不会自动修改已有模型配置。
- 在同一窗口/标签内切到聊天或设置再回来，父图、未发送指令及参考附件会保留；退出应用后不保存未发送草稿。已生成图片及记录仍保存在历史中。
- 文本附件不会被静默忽略。请在附件菜单选择“粘贴到输入框”展开，或移除附件后发送；父图会保留。
- 未知的实际尺寸、质量或接口信息会标为未知，不把请求参数当作服务商实际返回结果。

English instructions
Extract the entire ZIP into a new writable location, open $name, then run cherry-studio-kcfix.exe.
Keep the EXE, resources, locales, DLLs and cherry-portable.json together. No installer or per-launch NSIS extraction.
Back up data before testing; do not overwrite the old application/data directories. The previous release remains available.
Data defaults to the data directory beside the EXE, but existing ~/.cherrystudio/boot-config.json mappings may override it.
Profiles are not guaranteed isolated. Never open the same data with old and new versions concurrently; restore a pre-upgrade
backup for rollback. Move main data through Settings > Data > Data directory > Application data into a new empty directory.
Wait for copying and restart; do not manually overwrite existing data. Boot configuration, temporary files and component caches
can still remain on C:. After moving the application folder, reconfigure startup and shortcuts for the new location.
This build is unsigned. Verify the ZIP hash against SHA256SUMS and assess any Windows security warning before running.

Model metadata: new exact GPT Image 2.6 catalog entries provide verified modalities/capabilities. Unknown limits and prices
stay unknown, not zero/free. Validated Gemini/OpenRouter listing metadata initializes newly added unknown custom models;
it does not continuously refresh or overwrite existing custom configuration. Existing models remain unchanged until you
explicitly restore catalog defaults in Settings > Model Provider > Edit model. Confirmation restores capabilities, modalities,
token limits, streaming, parameters, reasoning and pricing together while preserving identity, name, grouping, routes and
status. Later manual edits still override defaults. Catalog support does not guarantee gateway/account/route availability.

Image workbench: the selected output is retained for the next edit. Older images create new branches. The left panel shows
parent/child lineage; the center keeps zoom, rotate and before/after comparison; the right separates read-only receipts from
next-edit settings. Disabled sends explain missing image-input capability or unsupported text attachments. Enable Vision only
when your provider supports image editing, or select a compatible model. Existing model settings are never changed automatically.
Expand pasted-text attachments with their menu or remove them before sending; the source image stays selected. Unknown
provider-effective dimensions/quality and execution details remain unknown rather than being inferred from request settings.
Within the same window/tab, navigating to Chat or Settings and back retains the source, unsent instruction and attachments.
Unsent drafts are not saved across application exit; generated outputs and their records remain in history.
Cherry account/cloud entry points remain removed; third-party API/OAuth remains.
Production bundles, main/renderer typechecks, focused model metadata/image/data/portable tests and packaging contracts are checked by this
workflow, not the full test suite. Publication additionally requires the exact ZIP to pass an isolated Windows Electron test
covering model settings, confirmed catalog restoration, manual overrides, generation, sequential edits, branching,
before/after and process restart against a loopback image API fixture.
The fixture verifies request routing and source-image bytes, not your provider, image quality or performance on your machine.
Live provider editing and actual local Windows experience still need your testing.
Optional local-model runtimes are downloaded on first use; they are not included. 本地模型运行库首次使用需联网下载。
The source commit, version, locked dependencies and Actions run identify this build; byte-for-byte reproducibility is not claimed.
"@ | Set-Content -LiteralPath "$output/README.txt" -Encoding utf8NoBOM
  Copy-Item -LiteralPath "$output/README.txt" -Destination "$root/README.txt"
  $zipPath = Join-Path $output "$name.zip"
  # ZipFile includes dotfiles and Windows hidden files, unlike Compress-Archive.
  [IO.Compression.ZipFile]::CreateFromDirectory($root, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $true)
  $archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $files = @(Get-ChildItem -LiteralPath $root -File -Recurse -Force)
    $entries = @($archive.Entries | Where-Object { !$_.FullName.EndsWith('/') })
    if ($entries.Count -ne $files.Count) { throw 'ZIP file count mismatch' }
    foreach ($file in $files) {
      $relative = [IO.Path]::GetRelativePath($root, $file.FullName).Replace('\', '/')
      $entry = $archive.GetEntry("$name/$relative")
      if (!$entry -or $entry.Length -ne $file.Length) { throw "ZIP is missing or truncates: $relative" }
      $stream = $entry.Open()
      try { $zipHash = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash }
      finally { $stream.Dispose() }
      if ($zipHash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
        throw "ZIP byte mismatch: $relative"
      }
    }
    foreach ($file in Get-ChildItem -LiteralPath $source -File -Recurse -Force) {
      $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
      if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $root $relative)).Hash) {
        throw "Staging changed packaged file: $relative"
      }
    }
  } finally { $archive.Dispose() }
  Get-Item -LiteralPath $zipPath, "$output/README.txt" | Sort-Object Name | ForEach-Object {
    "$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.Name)"
  } | Set-Content -LiteralPath "$output/SHA256SUMS" -Encoding ascii
} finally { Remove-Item -LiteralPath $stage -Recurse -Force }
