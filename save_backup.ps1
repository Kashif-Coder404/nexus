# 1. D: Drive par backup folder banao
New-Item -ItemType Directory -Force -Path "D:\Config_Backup"

# 2. Saari 60+ VS Code extensions ki list export karo
code --list-extensions | Out-File "D:\Config_Backup\vscode_extensions.txt"

# 3. VS Code settings, shortcuts aur snippets backup karo
if (Test-Path "$env:APPDATA\Code\User") {
    Copy-Item "$env:APPDATA\Code\User\settings.json" "D:\Config_Backup\" -Force -ErrorAction SilentlyContinue
    Copy-Item "$env:APPDATA\Code\User\keybindings.json" "D:\Config_Backup\" -Force -ErrorAction SilentlyContinue
    Copy-Item "$env:APPDATA\Code\User\snippets" "D:\Config_Backup\snippets" -Recurse -Force -ErrorAction SilentlyContinue
}

# 4. Git config backup karo (.gitconfig)
if (Test-Path "$HOME\.gitconfig") {
    Copy-Item "$HOME\.gitconfig" "D:\Config_Backup\" -Force
}

# 5. Antigravity AI Custom Skills & Config backup karo (.gemini/config)
if (Test-Path "$HOME\.gemini\config") {
    Copy-Item "$HOME\.gemini\config" "D:\Config_Backup\.gemini_config" -Recurse -Force
}

# 6. Environment variables export karo (reference ke liye)
Get-ChildItem Env: | Out-File "D:\Config_Backup\env_variables.txt"

Write-Host "✅ D:\Config_Backup me saari configurations safely save ho gayi!" -ForegroundColor Green
