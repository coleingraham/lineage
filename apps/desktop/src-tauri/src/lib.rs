use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

struct ServerProcess(Mutex<Option<Child>>);

fn find_server_script(app: &tauri::App) -> std::path::PathBuf {
    // In production, resources are bundled alongside the binary
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("server-sidecar").join("serve.cjs");
        if bundled.exists() {
            return bundled;
        }
    }
    // In development, the sidecar is at apps/desktop/server-sidecar/
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("server-sidecar")
        .join("serve.cjs");
    dev_path
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let serve_script = find_server_script(app);

            // Determine a writable directory for the database
            let db_path = app
                .path()
                .app_data_dir()
                .map(|d| {
                    std::fs::create_dir_all(&d).ok();
                    d.join("lineage.db")
                })
                .unwrap_or_else(|_| std::path::PathBuf::from("./lineage.db"));

            let child = Command::new("node")
                .arg(&serve_script)
                .env("PORT", "3210")
                .env("STORAGE_PATH", db_path.to_string_lossy().to_string())
                .spawn()
                .expect("failed to start server sidecar — is Node.js installed?");

            println!(
                "[desktop] Server sidecar started (pid={}, script={})",
                child.id(),
                serve_script.display()
            );

            app.manage(ServerProcess(Mutex::new(Some(child))));
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
