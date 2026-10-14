use super::*;

pub fn callback_client_id(selected: Option<&str>, issued: Option<&str>) -> Result<String> {
    if let Some(selected) = selected {
        ensure!(
            issued.is_none_or(|v| secure_equal(v, selected)),
            "OAuth client ID does not match the selected account"
        );
        return Ok(selected.to_owned());
    }
    let issued = issued.context("Registration is incomplete: OpenAI did not issue a client ID")?;
    ensure!(
        !issued.is_empty()
            && issued != "dynamic_agent_client"
            && issued.len() <= 256
            && !issued.chars().any(char::is_control),
        "Invalid issued OAuth client ID"
    );
    Ok(issued.to_owned())
}

pub(super) async fn listen_for_callback(
    listener: &TcpListener,
    state: &str,
    host: &str,
) -> Result<HashMap<String, String>> {
    loop {
        let (mut stream, _) = listener.accept().await?;
        let mut bytes = Vec::new();
        let read = timeout(Duration::from_secs(3), async {
            loop {
                let mut chunk = [0u8; 1024];
                let count = stream.read(&mut chunk).await?;
                ensure!(
                    count > 0 && bytes.len() + count <= 8192,
                    "Invalid callback request"
                );
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            Ok::<_, anyhow::Error>(())
        })
        .await;
        let params = if matches!(read, Ok(Ok(()))) {
            parse_callback(&bytes, state, host).ok()
        } else {
            None
        };
        let (status, body) = if params.is_some() {
            (
                "200 OK",
                "Wisp has received the sign-in callback. You can return to Wisp.",
            )
        } else {
            ("400 Bad Request", "This callback is not valid for Wisp.")
        };
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        let _ = timeout(
            Duration::from_secs(2),
            stream.write_all(response.as_bytes()),
        )
        .await;
        if let Some(params) = params {
            return Ok(params);
        }
    }
}

pub(super) fn parse_callback(
    bytes: &[u8],
    state: &str,
    host: &str,
) -> Result<HashMap<String, String>> {
    let mut headers = [httparse::EMPTY_HEADER; 32];
    let mut request = httparse::Request::new(&mut headers);
    ensure!(
        request.parse(bytes)?.is_complete(),
        "Incomplete callback request"
    );
    let target = request.path.context("Missing callback path")?;
    ensure!(
        request.method == Some("GET") && target.starts_with('/'),
        "Invalid callback method"
    );
    let hosts: Vec<_> = request
        .headers
        .iter()
        .filter(|header| header.name.eq_ignore_ascii_case("host"))
        .collect();
    ensure!(
        hosts.len() == 1 && std::str::from_utf8(hosts[0].value)?.trim() == host,
        "Invalid callback host"
    );
    let url = reqwest::Url::parse(&format!("http://{host}{target}"))?;
    ensure!(url.path() == "/auth/callback", "Invalid callback path");
    let mut params = HashMap::new();
    for (name, value) in url.query_pairs() {
        ensure!(
            params
                .insert(name.into_owned(), value.into_owned())
                .is_none(),
            "Duplicate callback parameter"
        );
    }
    ensure!(
        params.get("state").is_some_and(|v| secure_equal(v, state)),
        "OAuth state mismatch"
    );
    Ok(params)
}
