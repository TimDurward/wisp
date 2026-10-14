mod app;
mod auth;
mod conversation;
mod desktop;
mod inference;
mod languages;
mod model_options;
mod platform;
mod preferences;
mod protocol;
mod speech;
mod storage;
mod translation;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|s| s == "--help") {
        println!(
            "Wisp — bilingual WhatsApp messaging\n\nRun wisp to open WhatsApp.\nOptions: --data-dir=/absolute/path\nDiagnostics: --diagnostics or --smoke --screenshot=/absolute/path.png\nOptional smoke capture: --capture-panel=settings, reading, rules, defaults, languages or account"
        );
        return;
    }
    if args.iter().skip(1).any(|s| {
        s != "--smoke"
            && s != "--diagnostics"
            && ![
                "--screenshot=",
                "--data-dir=",
                "--icon-export=",
                "--capture-panel=",
            ]
            .iter()
            .any(|p| s.starts_with(p))
    }) {
        eprintln!("Unknown option. Run wisp --help for supported options.");
        std::process::exit(2);
    }
    let option = |prefix: &str| {
        args.iter()
            .find_map(|s| s.strip_prefix(prefix))
            .unwrap_or_default()
            .to_owned()
    };
    let smoke = args.iter().any(|s| s == "--smoke");
    let panel = option("--capture-panel=");
    if !panel.is_empty()
        && (!smoke
            || ![
                "settings",
                "reading",
                "rules",
                "defaults",
                "languages",
                "account",
            ]
            .contains(&panel.as_str()))
    {
        eprintln!(
            "Panel captures require --smoke and --capture-panel=settings, reading, rules, defaults, languages or account."
        );
        std::process::exit(2);
    }
    std::process::exit(desktop::bridge::ffi::run_app(
        smoke,
        args.iter().any(|s| s == "--diagnostics"),
        cxx_qt_lib::QString::from(&option("--screenshot=")),
        cxx_qt_lib::QString::from(&option("--data-dir=")),
        cxx_qt_lib::QString::from(&option("--icon-export=")),
        cxx_qt_lib::QString::from(&panel),
    ));
}
