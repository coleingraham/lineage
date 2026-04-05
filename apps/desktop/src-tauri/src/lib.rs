use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct ServerProcess(Mutex<Option<Child>>);

fn find_server_script(app: &tauri::App) -> Option<std::path::PathBuf> {
    // In production, resources are bundled alongside the binary
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("server-sidecar").join("serve.cjs");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    // In development, the sidecar is at apps/desktop/src-tauri/server-sidecar/
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("server-sidecar")
        .join("serve.cjs");
    if dev_path.exists() {
        return Some(dev_path);
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let serve_script = match find_server_script(app) {
                Some(path) => path,
                None => {
                    eprintln!("[desktop] WARNING: server sidecar not found, LLM features unavailable");
                    app.manage(ServerProcess(Mutex::new(None)));
                    return Ok(());
                }
            };

            // Determine a writable directory for the database
            let db_path = app
                .path()
                .app_data_dir()
                .map(|d| {
                    std::fs::create_dir_all(&d).ok();
                    d.join("lineage.db")
                })
                .unwrap_or_else(|_| std::path::PathBuf::from("./lineage.db"));

            match Command::new("node")
                .arg(&serve_script)
                .env("PORT", "3210")
                .env("STORAGE_PATH", db_path.to_string_lossy().to_string())
                .spawn()
            {
                Ok(child) => {
                    println!(
                        "[desktop] Server sidecar started (pid={}, script={})",
                        child.id(),
                        serve_script.display()
                    );
                    app.manage(ServerProcess(Mutex::new(Some(child))));
                }
                Err(e) => {
                    eprintln!(
                        "[desktop] WARNING: failed to start server sidecar: {} (script={})",
                        e,
                        serve_script.display()
                    );
                    eprintln!("[desktop] Is Node.js installed and on PATH?");
                    app.manage(ServerProcess(Mutex::new(None)));
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            println!("[desktop] Server sidecar stopped");
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
