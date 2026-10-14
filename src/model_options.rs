use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningEffort {
    None,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

// Account-specific model selection remains dynamic. The subscription catalog
// documents slug/display_name, not reasoning capabilities. Apply the published
// API specifications conservatively; unrecognized models use their own default.
// Sources: developers.openai.com/api/docs/models/{slug} (checked 2026-10-13).
pub fn reasoning_options(slug: &str) -> Vec<ReasoningEffort> {
    use ReasoningEffort::*;
    match slug {
        "gpt-6-astra" | "gpt-6.1-sol" => vec![Low, Medium, High, Xhigh, Max],
        "gpt-6-sol" | "gpt-6-luna" | "gpt-5.6-sol" => vec![None, Low, Medium, High, Xhigh, Max],
        "gpt-5.5" => vec![None, Low, Medium, High, Xhigh],
        _ => vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capabilities_are_conservative_and_model_specific() {
        assert!(!reasoning_options("gpt-6.1-sol").contains(&ReasoningEffort::None));
        assert!(reasoning_options("gpt-6-luna").contains(&ReasoningEffort::None));
        assert!(!reasoning_options("gpt-5.5").contains(&ReasoningEffort::Max));
        assert!(reasoning_options("unknown-model").is_empty());
        assert!(serde_json::from_str::<ReasoningEffort>("\"unbounded\"").is_err());
    }
}
