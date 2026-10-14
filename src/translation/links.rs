use anyhow::{Result, ensure};
use std::ops::Range;

pub fn links(text: &str) -> Vec<Range<usize>> {
    let mut result = Vec::new();
    let mut end = 0;
    for (start, _) in text.char_indices() {
        if start < end
            || text[..start]
                .chars()
                .next_back()
                .is_some_and(|c| c.is_alphanumeric() || c == '_')
        {
            continue;
        }
        let tail = &text[start..];
        if !["https://", "http://", "www."].iter().any(|prefix| {
            tail.get(..prefix.len())
                .is_some_and(|s| s.eq_ignore_ascii_case(prefix))
        }) {
            continue;
        }
        let stop = tail
            .find(|c: char| c.is_whitespace() || "<>\"".contains(c))
            .unwrap_or(tail.len());
        let mut url = tail[..stop].trim_end_matches(|c| ".,!?;:'…。！？、".contains(c));
        for (open, close) in [('(', ')'), ('[', ']'), ('{', '}')] {
            while url.ends_with(close) && url.matches(close).count() > url.matches(open).count() {
                url = &url[..url.len() - close.len_utf8()];
            }
        }
        let href = if url.get(..4).is_some_and(|s| s.eq_ignore_ascii_case("www.")) {
            format!("https://{url}")
        } else {
            url.to_owned()
        };
        if reqwest::Url::parse(&href)
            .is_ok_and(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
        {
            end = start + url.len();
            result.push(start..end);
        }
    }
    result
}

pub fn only_links(text: &str) -> bool {
    let found = links(text);
    if found.is_empty() {
        return false;
    }
    let separator = |s: &str| {
        s.chars()
            .all(|c| c.is_whitespace() || ".,!?;:'\"()[]{}<>…。！？、".contains(c))
    };
    let mut end = 0;
    for range in found {
        if !separator(&text[end..range.start]) {
            return false;
        }
        end = range.end;
    }
    separator(&text[end..])
}

pub struct ProtectedLinks {
    pub text: String,
    prefix: String,
    replacements: Vec<(String, String)>,
}
impl ProtectedLinks {
    pub fn new(source: &str) -> Self {
        let prefix = format!("⟦WISP_LINK_{}_", &crate::storage::hash(source)[..12]);
        let mut text = String::new();
        let mut replacements = Vec::new();
        let mut end = 0;
        for range in links(source) {
            let marker = format!("{prefix}{}⟧", replacements.len());
            text.push_str(&source[end..range.start]);
            text.push_str(&marker);
            replacements.push((marker, source[range.clone()].to_owned()));
            end = range.end;
        }
        text.push_str(&source[end..]);
        Self {
            text,
            prefix,
            replacements,
        }
    }
    pub fn is_empty(&self) -> bool {
        self.replacements.is_empty()
    }
    pub fn progress(&self, output: &str) -> String {
        let mut text = output.to_owned();
        for (marker, url) in &self.replacements {
            text = text.replace(marker, url);
        }
        // Do not show a marker while its bytes are still arriving in the stream.
        if !self.is_empty()
            && let Some(start) = text.rfind('⟦')
        {
            let suffix = &text[start..];
            if self.prefix.starts_with(suffix) || suffix.starts_with(&self.prefix) {
                text.truncate(start);
            }
        }
        text
    }
    pub fn finish(&self, output: &str) -> Result<String> {
        for (marker, _) in &self.replacements {
            ensure!(
                output.matches(marker).count() == 1,
                "Translation did not preserve a link. Try again"
            );
        }
        let mut text = output.to_owned();
        for (marker, url) in &self.replacements {
            text = text.replace(marker, url);
        }
        ensure!(
            !text.contains(&self.prefix),
            "Translation did not preserve a link. Try again"
        );
        let restored: Vec<_> = links(&text)
            .into_iter()
            .map(|range| text[range].to_owned())
            .collect();
        let expected: Vec<_> = self
            .replacements
            .iter()
            .map(|(_, url)| url.clone())
            .collect();
        ensure!(
            restored == expected,
            "Translation changed a link. Try again"
        );
        ensure!(text.len() <= 24_000, "Translation exceeded the size limit");
        Ok(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_keep_queries_unicode_and_balanced_parentheses() {
        let text = "(https://example.com/Place_(park)?q=é#入口). www.example.org/a!";
        let found: Vec<_> = links(text).into_iter().map(|range| &text[range]).collect();
        assert_eq!(
            found,
            [
                "https://example.com/Place_(park)?q=é#入口",
                "www.example.org/a"
            ]
        );
        assert!(only_links(text));
        assert!(!only_links(&format!("Meet me {text}")));
        assert!(!only_links("javascript:alert(1)"));
        let apostrophe = "https://en.wikipedia.org/wiki/D'Angelo";
        assert_eq!(&apostrophe[links(apostrophe)[0].clone()], apostrophe);
    }
    #[test]
    fn markers_restore_exact_urls_and_partial_markers_stay_out_of_previews() {
        let source = "Go to https://share.google/A123?x=1#here then https://example.com/é";
        let protected = ProtectedLinks::new(source);
        assert!(!protected.text.contains("https://"));
        let translated = protected
            .text
            .replace("Go to", "Ve a")
            .replace(" then ", " y después ");
        assert_eq!(
            protected.finish(&translated).unwrap(),
            source
                .replace("Go to", "Ve a")
                .replace(" then ", " y después ")
        );
        for (index, _) in protected.replacements[0].0.char_indices().skip(1) {
            assert_eq!(
                protected.progress(&format!("Ve a {}", &protected.replacements[0].0[..index])),
                "Ve a "
            );
        }
        assert!(protected.finish("Ve a https://changed.example").is_err());
        assert!(
            protected
                .finish(&format!("{translated} https://extra.example"))
                .is_err()
        );
        assert!(
            protected
                .finish(&translated.replace(&protected.replacements[0].0, ""))
                .is_err()
        );
        assert!(
            protected
                .finish(&format!("{translated} {}99⟧", protected.prefix))
                .is_err()
        );
    }
}
