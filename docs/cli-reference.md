# CLI Reference

Command-line options for launching Orchy.

---

## Usage

```bash
orchy [options]
```

## Options

| Flag | Description |
|------|-------------|
| `--port <number>` | Use a specific port (default: 3456) |
| `--no-browser` | Start without opening the browser |
| `--help` | Show help |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ORCHESTRATOR_PORT` | Override the default port |
| `ORCHESTRATOR_DATA_DIR` | Override the data directory |
| `ORCHESTRATOR_CONFIG_DIR` | Override the config directory |
| `ORCHESTRATOR_CACHE_DIR` | Override the cache directory |

See [Configuration](configuration.md) for details on storage locations.

## Examples

```bash
# Start Orchy (default port, opens browser)
orchy

# Start on a specific port
orchy --port 4000

# Start without opening the browser
orchy --no-browser
```

## Desktop Application

Orchy also ships as a **desktop application** (via Tauri) that wraps the same functionality in a native window.

---

← [Configuration](configuration.md) | [Troubleshooting →](troubleshooting.md)
