//! Regenerates `ui/src/api/bindings/` and `ui/src/api/client.ts`.
//!
//! cargo run -p microspat-engine --bin gen-bindings [-- <ui/src/api dir>]

fn main() {
    let dir = std::env::args()
        .nth(1)
        .map(std::path::PathBuf::from)
        .unwrap_or_else(microspat_engine::bindings::default_out_dir);
    match microspat_engine::bindings::generate(&dir) {
        Ok(()) => println!("wrote {}", dir.display()),
        Err(e) => {
            eprintln!("gen-bindings: {e}");
            std::process::exit(1);
        }
    }
}
