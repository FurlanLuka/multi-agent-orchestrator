// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tokio::sync::RwLock;

/// State shared across the application
struct BackendState {
    port: Option<u32>,
    ready: bool,
    error: Option<String>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            port: None,
            ready: false,
            error: None,
        }
    }
}

type SharedState = Arc<RwLock<BackendState>>;

/// Get the backend port (returns null if not yet ready)
#[tauri::command]
async fn get_backend_port(state: tauri::State<'_, SharedState>) -> Result<Option<u32>, String> {
    let state = state.read().await;
    Ok(state.port)
}

/// Check if the backend is ready
#[tauri::command]
async fn is_backend_ready(state: tauri::State<'_, SharedState>) -> Result<bool, String> {
    let state = state.read().await;
    Ok(state.ready)
}

/// Spawn the backend sidecar process
async fn spawn_backend(app: AppHandle, state: SharedState) {
    let shell = app.shell();

    // Spawn the sidecar with --no-browser flag
    // Pass ORCHESTRATOR_TAURI env var so backend knows it's running in Tauri
    let sidecar = match shell.sidecar("orchy") {
        Ok(cmd) => cmd
            .args(["--no-browser"])
            .env("ORCHESTRATOR_TAURI", "true"),
        Err(e) => {
            eprintln!("Failed to create sidecar command: {}", e);
            let _ = app.emit("backend-error", format!("Failed to create sidecar: {}", e));
            return;
        }
    };

    let (mut rx, _child) = match sidecar.spawn() {
        Ok(result) => result,
        Err(e) => {
            eprintln!("Failed to spawn sidecar: {}", e);
            let _ = app.emit("backend-error", format!("Failed to spawn backend: {}", e));
            return;
        }
    };

    // Process output from the sidecar
    use tauri_plugin_shell::process::CommandEvent;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                let line_str = String::from_utf8_lossy(&line);
                println!("[backend stdout] {}", line_str);

                // Check for the ready signal
                if let Some(port_str) = line_str.strip_prefix("[ORCHESTRATOR_READY]:") {
                    if let Ok(port) = port_str.trim().parse::<u32>() {
                        println!("Backend ready on port {}", port);

                        // Update state
                        {
                            let mut state_guard = state.write().await;
                            state_guard.port = Some(port);
                            state_guard.ready = true;
                        }

                        // Inject port directly into webview (most reliable method)
                        if let Some(window) = app.get_webview_window("main") {
                            let js = format!("window.__ORCHESTRATOR_PORT__ = {}; console.log('[Tauri] Port injected: {}');", port, port);
                            if let Err(e) = window.eval(&js) {
                                eprintln!("Failed to inject port into webview: {}", e);
                            } else {
                                println!("Injected port {} into webview", port);
                            }
                        }

                        // Also emit event to frontend (backup method)
                        if let Err(e) = app.emit("backend-ready", port) {
                            eprintln!("Failed to emit backend-ready event: {}", e);
                        }
                    }
                }
            }
            CommandEvent::Stderr(line) => {
                let line_str = String::from_utf8_lossy(&line);
                eprintln!("[backend stderr] {}", line_str);

                // Check for error signal
                if let Some(error_msg) = line_str.strip_prefix("[ORCHESTRATOR_ERROR]:") {
                    let error = error_msg.trim().to_string();

                    // Update state
                    {
                        let mut state_guard = state.write().await;
                        state_guard.error = Some(error.clone());
                    }

                    // Emit error event to frontend
                    if let Err(e) = app.emit("backend-error", error) {
                        eprintln!("Failed to emit backend-error event: {}", e);
                    }
                }
            }
            CommandEvent::Error(error) => {
                eprintln!("Backend process error: {}", error);
                let _ = app.emit("backend-error", format!("Process error: {}", error));
            }
            CommandEvent::Terminated(payload) => {
                let exit_info = match (payload.code, payload.signal) {
                    (Some(code), _) => format!("exit code {}", code),
                    (_, Some(signal)) => format!("signal {}", signal),
                    _ => "unknown reason".to_string(),
                };
                println!("Backend process terminated: {}", exit_info);

                // Update state
                {
                    let mut state_guard = state.write().await;
                    state_guard.ready = false;
                }

                // Only emit error if we haven't successfully connected yet
                let state_guard = state.read().await;
                if state_guard.port.is_none() {
                    let _ = app.emit("backend-error", format!("Backend terminated: {}", exit_info));
                }
                break;
            }
            _ => {}
        }
    }
}

fn main() {
    let state: SharedState = Arc::new(RwLock::new(BackendState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![get_backend_port, is_backend_ready])
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let state_clone = state.clone();

            // Spawn the backend on a separate async task
            tauri::async_runtime::spawn(async move {
                spawn_backend(app_handle, state_clone).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
