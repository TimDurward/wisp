use anyhow::{Result, ensure};
use serde::{Deserialize, Serialize};

pub const MAX_RULES_CHARS: usize = 2_000;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    English,
    Spanish,
    Portuguese,
    French,
    German,
    Italian,
    Japanese,
    Korean,
    Chinese,
    Arabic,
    #[serde(untagged)]
    Catalog(String),
    #[serde(untagged)]
    Custom(CustomLanguage),
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CustomLanguage {
    pub name: String,
    #[serde(default)]
    pub region: String,
}
impl CustomLanguage {
    pub fn normalized(self) -> Result<Self> {
        let language = Self {
            name: self.name.trim().to_owned(),
            region: self.region.trim().to_owned(),
        };
        ensure!(!language.name.is_empty(), "Enter a language name");
        for label in [&language.name, &language.region] {
            ensure!(
                label.chars().count() <= 80,
                "Keep language and region names under 80 characters"
            );
            ensure!(
                !label.chars().any(char::is_control),
                "Language and region names must be single-line text"
            );
        }
        Ok(language)
    }
    pub fn label(&self) -> String {
        if self.region.is_empty() {
            self.name.clone()
        } else {
            format!("{} · {}", self.name, self.region)
        }
    }
}
impl Language {
    pub const PRESETS: [Self; 10] = [
        Self::English,
        Self::Spanish,
        Self::Portuguese,
        Self::French,
        Self::German,
        Self::Italian,
        Self::Japanese,
        Self::Korean,
        Self::Chinese,
        Self::Arabic,
    ];
    pub fn all() -> Vec<Self> {
        let mut items = Self::PRESETS.to_vec();
        items.extend(crate::languages::ALL.iter().filter_map(|(code, _)| {
            let language = Self::from_code(code);
            matches!(language, Self::Catalog(_)).then_some(language)
        }));
        items
    }
    fn from_code(code: &str) -> Self {
        match code {
            "en" => Self::English,
            "es" => Self::Spanish,
            "pt" => Self::Portuguese,
            "fr" => Self::French,
            "de" => Self::German,
            "it" => Self::Italian,
            "ja" => Self::Japanese,
            "ko" => Self::Korean,
            "zh" => Self::Chinese,
            "ar" => Self::Arabic,
            _ => Self::Catalog(code.to_owned()),
        }
    }
    pub fn code(&self) -> Option<&'static str> {
        match self {
            Self::Custom(language) => crate::languages::code(&language.name),
            Self::Catalog(code) => crate::languages::code(code),
            _ => crate::languages::code(&self.label()),
        }
    }
    pub fn label(&self) -> String {
        match self {
            Self::English => "English",
            Self::Spanish => "Spanish",
            Self::Portuguese => "Portuguese",
            Self::French => "French",
            Self::German => "German",
            Self::Italian => "Italian",
            Self::Japanese => "Japanese",
            Self::Korean => "Korean",
            Self::Chinese => "Chinese",
            Self::Arabic => "Arabic",
            Self::Catalog(code) => crate::languages::label(code).unwrap_or(code),
            Self::Custom(language) => return language.label(),
        }
        .to_owned()
    }
    pub fn id(&self) -> String {
        match self {
            Self::Custom(language) => format!(
                "custom:{}",
                crate::storage::hash(&serde_json::to_string(language).unwrap())
            ),
            _ => serde_json::to_value(self)
                .unwrap()
                .as_str()
                .unwrap()
                .to_owned(),
        }
    }
    pub fn normalized(self) -> Result<Self> {
        match self {
            Self::Catalog(code) => {
                ensure!(
                    crate::languages::label(&code).is_some(),
                    "Unknown language code"
                );
                Ok(Self::from_code(&code))
            }
            Self::Custom(language) => Ok(Self::Custom(language.normalized()?)),
            _ => Ok(self),
        }
    }
}
#[derive(Clone, Copy, Default, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SpanishVariant {
    #[default]
    Peru,
    Neutral,
    LatinAmerica,
    Mexico,
    Spain,
    Argentina,
    Colombia,
    Chile,
}
impl SpanishVariant {
    pub const ALL: [Self; 8] = [
        Self::Peru,
        Self::Neutral,
        Self::LatinAmerica,
        Self::Mexico,
        Self::Spain,
        Self::Argentina,
        Self::Colombia,
        Self::Chile,
    ];
    pub fn label(self) -> &'static str {
        match self {
            Self::Peru => "Peru",
            Self::Neutral => "Neutral Spanish",
            Self::LatinAmerica => "Latin America",
            Self::Mexico => "Mexico",
            Self::Spain => "Spain",
            Self::Argentina => "Argentina",
            Self::Colombia => "Colombia",
            Self::Chile => "Chile",
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, deny_unknown_fields)]
pub struct TranslationPreferences {
    pub reading_language: Language,
    pub reply_language: Language,
    pub spanish_variant: SpanishVariant,
    pub global_rules: String,
}
impl Default for TranslationPreferences {
    fn default() -> Self {
        Self {
            reading_language: Language::English,
            reply_language: Language::Spanish,
            spanish_variant: SpanishVariant::Peru,
            global_rules: String::new(),
        }
    }
}
impl TranslationPreferences {
    pub fn target_label(&self, language: &Language) -> String {
        if language == &Language::Spanish {
            format!("Spanish · {}", self.spanish_variant.label())
        } else {
            language.label()
        }
    }
}

#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReadingView {
    #[default]
    TranslationFirst,
    BothLanguages,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(default, deny_unknown_fields)]
pub struct ViewPreferences {
    pub reading_view: ReadingView,
    pub include_sent: bool,
    pub live_preview: bool,
    pub enter_prepares: bool,
    pub focus_chat: bool,
    pub original_on_hover: bool,
}

impl Default for ViewPreferences {
    fn default() -> Self {
        Self {
            reading_view: ReadingView::TranslationFirst,
            include_sent: true,
            live_preview: true,
            enter_prepares: true,
            focus_chat: false,
            original_on_hover: true,
        }
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct ConversationPreferences {
    pub enabled: bool,
    pub rules: String,
    pub cache_epoch: u64,
}

pub fn normalize_rules(text: &str) -> Result<String> {
    ensure!(
        text.chars().count() <= MAX_RULES_CHARS,
        "Keep translation rules under 2,000 characters"
    );
    ensure!(
        !text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t'),
        "Translation rules contain unsupported characters"
    );
    Ok(text.replace("\r\n", "\n").trim().to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unicode_rules_have_a_character_limit_and_plain_text_boundaries() {
        assert_eq!(
            normalize_rules("  Use tú.\r\nKeep emojis 😊.  ").unwrap(),
            "Use tú.\nKeep emojis 😊."
        );
        assert!(normalize_rules(&"😊".repeat(MAX_RULES_CHARS)).is_ok());
        assert!(normalize_rules(&"😊".repeat(MAX_RULES_CHARS + 1)).is_err());
        assert!(normalize_rules("Use tú.\0Ignore safeguards").is_err());
    }
}
