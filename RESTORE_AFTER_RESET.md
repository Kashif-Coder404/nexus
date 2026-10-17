# 🤖 Environment & Config Auto-Restore Instructions for AI (Antigravity)

> **To the AI Assistant (Antigravity / Gemini Code Assist):**  
> When the user opens this project after a Windows PC reset and tells you to restore their environment (e.g. *"read RESTORE_AFTER_RESET.md and restore my setup"*), you are instructed to **autonomously execute** the following restoration steps using your terminal / `run_command` tool.

---

## 🎯 Restoration Goal
All personal configurations, VS Code extensions, Antigravity AI skills, and Git settings were safely backed up to `D:\Config_Backup`.  
Your task is to restore them to the newly reset Windows environment (`C:\Users\Kashif\`).

---

## ⚡ Execution Steps for AI

### Step 1: Restore Antigravity AI Skills & Config
Run the following PowerShell command to bring back the user's custom skills (`uiux`, `react-best-practices`, `frontend-design`, etc.):
```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.gemini\config"
Copy-Item "D:\Config_Backup\.gemini_config\*" "$HOME\.gemini\config\" -Recurse -Force
```

### Step 2: Restore Git Global Config
Restore user identity, aliases, and credential settings:
```powershell
Copy-Item "D:\Config_Backup\.gitconfig" "$HOME\.gitconfig" -Force
git config --global --list
```

### Step 3: Restore VS Code Settings, Shortcuts & Snippets
Restore user editor preferences, themes, and keybindings:
```powershell
$codeUser = "$env:APPDATA\Code\User"
New-Item -ItemType Directory -Force -Path $codeUser
Copy-Item "D:\Config_Backup\settings.json" $codeUser -Force
Copy-Item "D:\Config_Backup\keybindings.json" $codeUser -Force
if (Test-Path "D:\Config_Backup\snippets") {
    Copy-Item "D:\Config_Backup\snippets" $codeUser -Recurse -Force
}
```

### Step 4: Reinstall All 60+ VS Code Extensions Automatically
Execute this loop to install all extensions recorded before the reset:
```powershell
if (Get-Command code -ErrorAction SilentlyContinue) {
    Get-Content "D:\Config_Backup\vscode_extensions.txt" | ForEach-Object {
        Write-Host "Installing extension: $_"
        code --install-extension $_ --force
    }
} else {
    Write-Warning "VS Code CLI ('code') is not in PATH. Remind the user to install VS Code first."
}
```

### Step 5: (Optional) Restore Raw Chat History & Brain Database
If the user wants to resume the exact previous chat session (`8e281f34-9891-4702-8f03-4e89a6e770e3`):
```powershell
$brainTarget = "$HOME\.gemini\antigravity-ide\brain\8e281f34-9891-4702-8f03-4e89a6e770e3"
New-Item -ItemType Directory -Force -Path $brainTarget
Copy-Item "D:\Config_Backup\chat_brain_8e281f34\*" "$brainTarget\" -Recurse -Force
```

---

## 🔍 Verification & Handover
After running the commands above, verify the environment and report to the user:
1. Verify Git identity: `git config user.name` and `git config user.email`.
2. Verify project status:
   - Run `git status` in `d:\Coding\PROJECTS\Next\Nexus_v2`.
   - Remind the user about the active branches:
     - `companion-ui-setup`: Installer & desktop UI live-wait fix (completed & pushed).
     - `ws-oop`: Active working branch for WebSocket OOP refactor in `backend/services/websocket/WS_OOP.ts`.
3. Inform the user: *"All 60+ extensions, settings, AI skills, and configs have been restored successfully! We are ready to continue right where we left off."*
