use super::{
    ClientBundle,
    assets::{MINIMUM_CSS, POSTINJECT_JS},
};

pub fn postinject(client_bundle: Option<&ClientBundle>, confirm_trial: bool) -> String {
    let script = client_bundle
        .map(|bundle| bundle.postinject.as_str())
        .unwrap_or(POSTINJECT_JS.as_str());
    let minimum_css = client_bundle
        .map(|bundle| bundle.minimum_css.as_str())
        .unwrap_or(MINIMUM_CSS.as_str());
    let css = serde_json::to_string(minimum_css).expect("minimum.css must be valid UTF-8");
    let confirm = if confirm_trial {
        "window.__TAURI_INTERNALS__?.invoke?.(\"confirm_client_update\")?.catch?.(error => console.error(\"[yapmod] client update confirmation failed\", error));"
    } else {
        ""
    };

    format!(
        "if (window.top === window && ({})) {{\n{script}\nwindow.__yapmod.applyCss({css});\n{confirm}\n}}",
        crate::hosts::INJECTION_ORIGINS
            .iter()
            .map(|origin| format!("location.origin === {origin:?}"))
            .collect::<Vec<_>>()
            .join(" || ")
    )
}
