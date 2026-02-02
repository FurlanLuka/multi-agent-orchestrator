use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    // Get the target triple
    let target = env::var("TARGET").unwrap_or_else(|_| String::from("unknown"));

    // Define source and destination paths
    let project_root = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist_dir = project_root.parent().unwrap().join("dist");
    let binaries_dir = project_root.join("binaries");

    // Create binaries directory if it doesn't exist
    fs::create_dir_all(&binaries_dir).expect("Failed to create binaries directory");

    // Map from our binary names to Tauri sidecar names
    let mappings = [
        ("orchy-macos-arm64", "orchy-aarch64-apple-darwin"),
        ("orchy-macos-x64", "orchy-x86_64-apple-darwin"),
        ("orchy-linux-x64", "orchy-x86_64-unknown-linux-gnu"),
        ("orchy-windows-x64.exe", "orchy-x86_64-pc-windows-msvc.exe"),
    ];

    println!("cargo:rerun-if-changed=../dist");

    for (src_name, dst_name) in mappings.iter() {
        let src_path = dist_dir.join(src_name);
        let dst_path = binaries_dir.join(dst_name);

        if src_path.exists() {
            // Copy the file
            if let Err(e) = fs::copy(&src_path, &dst_path) {
                println!("cargo:warning=Failed to copy {} to {}: {}", src_name, dst_name, e);
            } else {
                println!("cargo:warning=Copied {} to {}", src_name, dst_name);

                // Set executable permissions on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if let Ok(metadata) = fs::metadata(&dst_path) {
                        let mut perms = metadata.permissions();
                        perms.set_mode(0o755);
                        let _ = fs::set_permissions(&dst_path, perms);
                    }
                }
            }
        } else {
            println!("cargo:warning=Source binary not found: {}", src_path.display());
        }
    }

    // Also check if the current target binary exists and warn if not
    let current_binary = match target.as_str() {
        "aarch64-apple-darwin" => "orchy-aarch64-apple-darwin",
        "x86_64-apple-darwin" => "orchy-x86_64-apple-darwin",
        "x86_64-unknown-linux-gnu" => "orchy-x86_64-unknown-linux-gnu",
        "x86_64-pc-windows-msvc" => "orchy-x86_64-pc-windows-msvc.exe",
        _ => "",
    };

    if !current_binary.is_empty() {
        let binary_path = binaries_dir.join(current_binary);
        if !binary_path.exists() {
            println!("cargo:warning=Binary for current target not found: {}", current_binary);
            println!("cargo:warning=Run the appropriate build:pkg-* script first");
        }
    }

    tauri_build::build();
}
