---
rules:
  - id: powershell-no-ask
    description: Execute PowerShell commands directly without asking permission
    pattern: |
      When the user wants to run terminal commands:
      - Use run_in_terminal tool immediately without asking "Can I use PowerShell?"
      - Use PowerShell for all terminal operations
      - Do NOT ask for confirmation before executing commands
      - Provide brief explanation of what the command does
---

# Copilot Instructions

## PowerShell Usage
- **Execute immediately** — do not ask permission
- Use `run_in_terminal` with mode='sync' or mode='async' as appropriate
- No confirmation dialogs
- Only ask for input if the command will prompt interactively (like passwords)

## Terminal Operations
- Default to PowerShell
- Run commands directly based on user intent
- Explain the purpose, then execute

