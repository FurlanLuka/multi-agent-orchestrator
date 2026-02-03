# Day 4 - January 27, 2026

> "Remove Tauri, Distribute as Pure CLI"

## The Pivot: Simpler is Better

Only 2 sessions today, but a major architectural decision.

---

## The Tauri Struggle

After wrestling with Tauri for a day, I hit wall after wall:
- Shell environment issues when launched from GUI vs CLI
- `process.env.PATH` was minimal when running as a GUI app
- NVM, Homebrew paths weren't available
- Spawning Claude CLI became unreliable

---

## The Decision

Instead of fighting native app complexities, why not just ship a CLI tool?

The conversation focused on:
- Using `pkg` to bundle Node.js into a single binary
- Code obfuscation for distribution
- Homebrew tap for installation (`brew install FurlanLuka/aio/aio`)

### The Banner
I wanted it to feel professional:
> "User wanted a nice ASCII art banner when running the aio binary"

```
═══════════════════════════════════════════════════════════════
  Multi-Agent Orchestrator
═══════════════════════════════════════════════════════════════
  Version:     1.0.0
  Author:      Luka Furlan
  To stop:     Press Ctrl+C
  Logs:        ~/.aio-config/logs/orchestrator.log
```

---

## What Changed

- **Removed Tauri**: No more native app wrapper
- **Pure CLI Distribution**: `pkg` for bundling
- **Obfuscation**: Protect source code in distributed binary
- **Homebrew**: Clean installation experience

---

## Session Files

| Session ID | Summary |
|------------|---------|
| [`0bf1bfe1`](~/.claude-personal/projects/-Users-lukafurlan-Documents-orchestrator/0bf1bfe1-dc1f-49fe-9b48-ec8fe5002432.jsonl) | Remove Tauri, distribute as CLI tool |

---

## Reflections

Sometimes removing complexity is the best feature. The CLI approach meant:
- No shell environment issues
- Users can install via Homebrew
- Works in any terminal
- Much simpler to maintain

Lesson learned: don't over-engineer distribution when a simple solution exists.
