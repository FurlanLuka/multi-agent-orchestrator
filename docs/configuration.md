# Configuration

All Orchy data is stored locally on your machine.

---

## Storage Location

```
~/.orchy-config/
├── workspaces.json              # All workspace configurations
├── projects.json                # Project configurations
├── github-settings.json         # GitHub global preferences
├── sessions/                    # Session data and logs
│   └── {sessionId}/
│       └── projects/
│           └── {projectName}/
├── design-sessions/             # Design session artifacts
│   └── {sessionId}/
├── designs/                     # Saved design library
└── logs/
    └── orchestrator.log         # Application log
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ORCHESTRATOR_PORT` | Override the default port (3456) |
| `ORCHESTRATOR_DATA_DIR` | Override the data directory (default: `~/.orchy-config/`) |
| `ORCHESTRATOR_CONFIG_DIR` | Override the config directory |
| `ORCHESTRATOR_CACHE_DIR` | Override the cache directory |

---

← [Notifications](notifications.md) | [CLI Reference →](cli-reference.md)
