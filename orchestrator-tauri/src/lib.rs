use tauri::{AppHandle, Emitter, Manager, RunEvent};
use tauri_plugin_shell::{process::{CommandEvent, CommandChild}, ShellExt};
use std::sync::{Arc, Mutex};
use log::{info, error, warn};

/// State for tracking the backend sidecar process
struct BackendState {
    port: Option<u16>,
    process_id: Option<u32>,
    child: Option<CommandChild>,
}

impl Default for BackendState {
    fn default() -> Self {
        Self {
            port: None,
            process_id: None,
            child: None,
        }
    }
}

/// Parse the port from the backend's ready signal
/// Format: [ORCHESTRATOR_READY]:{port}
fn parse_ready_signal(line: &str) -> Option<u16> {
    if line.starts_with("[ORCHESTRATOR_READY]:") {
        let port_str = line.trim_start_matches("[ORCHESTRATOR_READY]:");
        port_str.trim().parse().ok()
    } else {
        None
    }
}

/// Parse error message from the backend's error signal
/// Format: [ORCHESTRATOR_ERROR]:{message}
fn parse_error_signal(line: &str) -> Option<String> {
    if line.starts_with("[ORCHESTRATOR_ERROR]:") {
        Some(line.trim_start_matches("[ORCHESTRATOR_ERROR]:").trim().to_string())
    } else {
        None
    }
}

/// Spawn the Node.js backend sidecar and wait for it to be ready
async fn spawn_backend(app: &AppHandle) -> Result<u16, String> {
    info!("Spawning backend sidecar...");

    // Get the sidecar command
    let sidecar = app
        .shell()
        .sidecar("aio-orchestrator-backend")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .env("ORCHESTRATOR_TAURI", "true")
        .env("NODE_ENV", "production");

    // Spawn the sidecar
    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    let pid = child.pid();
    info!("Backend sidecar spawned with PID: {}", pid);

    // Store the process ID and child handle for cleanup
    let state = app.state::<Arc<Mutex<BackendState>>>();
    {
        let mut state = state.lock().unwrap();
        state.process_id = Some(pid);
        state.child = Some(child);
    }

    // Wait for the ready signal with timeout
    let timeout = std::time::Duration::from_secs(30);
    let start = std::time::Instant::now();

    while start.elapsed() < timeout {
        match tokio::time::timeout(std::time::Duration::from_millis(100), rx.recv()).await {
            Ok(Some(event)) => {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line_str = String::from_utf8_lossy(&line);
                        info!("[Backend] {}", line_str.trim());

                        // Check for error signal first
                        if let Some(error_msg) = parse_error_signal(&line_str) {
                            error!("Backend error: {}", error_msg);
                            return Err(error_msg);
                        }

                        // Check for ready signal
                        if let Some(port) = parse_ready_signal(&line_str) {
                            info!("Backend ready on port {}", port);

                            // Store the port
                            let mut state = state.lock().unwrap();
                            state.port = Some(port);

                            // Spawn background task to continue logging
                            tauri::async_runtime::spawn(async move {
                                let mut rx = rx;
                                while let Some(event) = rx.recv().await {
                                    match event {
                                        CommandEvent::Stdout(line) => {
                                            let line_str = String::from_utf8_lossy(&line);
                                            info!("[Backend] {}", line_str.trim());
                                        }
                                        CommandEvent::Stderr(line) => {
                                            let line_str = String::from_utf8_lossy(&line);
                                            warn!("[Backend Error] {}", line_str.trim());
                                        }
                                        CommandEvent::Terminated(payload) => {
                                            info!("[Backend] Process terminated with code: {:?}", payload.code);
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            });

                            return Ok(port);
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        let line_str = String::from_utf8_lossy(&line);
                        warn!("[Backend Error] {}", line_str.trim());

                        // Check for error signal in stderr as well
                        if let Some(error_msg) = parse_error_signal(&line_str) {
                            error!("Backend error: {}", error_msg);
                            return Err(error_msg);
                        }
                    }
                    CommandEvent::Error(err) => {
                        error!("[Backend] Process error: {}", err);
                        return Err(format!("Backend process error: {}", err));
                    }
                    CommandEvent::Terminated(payload) => {
                        error!("[Backend] Process terminated with code: {:?}", payload.code);
                        return Err(format!("Backend terminated with code: {:?}", payload.code));
                    }
                    _ => {}
                }
            }
            Ok(None) => {
                // Channel closed
                break;
            }
            Err(_) => {
                // Timeout on this iteration, continue waiting
            }
        }
    }

    Err("Timeout waiting for backend to start".to_string())
}

/// Tauri command to get the backend port
#[tauri::command]
fn get_backend_port(state: tauri::State<'_, Arc<Mutex<BackendState>>>) -> Option<u16> {
    let state = state.lock().unwrap();
    state.port
}

/// Tauri command to check if backend is ready
#[tauri::command]
fn is_backend_ready(state: tauri::State<'_, Arc<Mutex<BackendState>>>) -> bool {
    let state = state.lock().unwrap();
    state.port.is_some()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Arc::new(Mutex::new(BackendState::default())))
        .invoke_handler(tauri::generate_handler![get_backend_port, is_backend_ready])
        .setup(|app| {
            info!("AIO Orchestrator starting...");

            // Spawn backend in background
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match spawn_backend(&app_handle).await {
                    Ok(port) => {
                        info!("Backend started successfully on port {}", port);

                        // Inject port into webview
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let js = format!("window.__ORCHESTRATOR_PORT__ = {};", port);
                            if let Err(e) = window.eval(&js) {
                                error!("Failed to inject port into webview: {}", e);
                            }
                        }

                        // Emit event to frontend
                        let _ = app_handle.emit("backend-ready", port);
                    }
                    Err(e) => {
                        error!("Failed to start backend: {}", e);
                        let _ = app_handle.emit("backend-error", e.clone());
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match &event {
                RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                    info!("App exiting, cleaning up backend process...");

                    let state = app_handle.state::<Arc<Mutex<BackendState>>>();
                    let mut state = state.lock().unwrap();

                    if let Some(child) = state.child.take() {
                        info!("Killing backend process {}", state.process_id.unwrap_or(0));
                        if let Err(e) = child.kill() {
                            error!("Failed to kill backend process: {}", e);
                        } else {
                            info!("Backend process terminated");
                        }
                    }
                }
                _ => {}
            }
        });
}
