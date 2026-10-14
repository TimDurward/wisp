use cxx_qt_build::CxxQtBuilder;

fn main() {
    track_tree("web/src");
    track_tree("native/include");
    println!("cargo:rerun-if-changed=tools/build-web.mjs");
    println!("cargo:rerun-if-changed=package-lock.json");
    let assets = std::process::Command::new("node")
        .arg("tools/build-web.mjs")
        .status()
        .expect("Node.js is required to build web assets. Install Node 24 and run npm ci.");
    assert!(
        assets.success(),
        "Web build failed. Run npm ci, then npm run build:web."
    );
    let builder = CxxQtBuilder::new()
        .file("src/desktop/bridge.rs")
        .cpp_file("native/src/AppShell.cpp")
        .cpp_file("native/src/DesktopController.cpp")
        .cpp_file("native/src/TranslationChannel.cpp")
        .cpp_file("native/include/wisp/DesktopController.h")
        .cpp_file("native/include/wisp/TranslationChannel.h")
        .include_dir("native/include")
        .qt_module("Gui")
        .qt_module("WebEngineCore")
        .qt_module("WebEngineQuick")
        .qt_module("WebChannel")
        .qt_module("Network")
        .qt_module("Qml")
        .qt_module("Quick")
        .qt_module("QuickControls2")
        .qt_module("LabsStyleKit")
        .qt_module("Svg")
        .qrc("native/resources.qrc");
    // SAFETY: only defines a version string; generated CXX-Qt compilation flags remain intact.
    unsafe {
        builder.cc_builder(|cc| {
            cc.define(
                "WISP_APP_VERSION",
                Some(concat!("\"", env!("CARGO_PKG_VERSION"), "\"")),
            );
        })
    }
    .build();
}

fn track_tree(directory: &str) {
    println!("cargo:rerun-if-changed={directory}");
    for entry in std::fs::read_dir(directory).expect("Missing source directory") {
        let entry = entry.expect("Cannot read source entry");
        let path = entry.path();
        if path.is_dir() {
            track_tree(path.to_str().expect("Source paths must be UTF-8"));
        } else {
            println!("cargo:rerun-if-changed={}", path.display());
        }
    }
}
