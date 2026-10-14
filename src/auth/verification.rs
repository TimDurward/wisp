use super::*;

pub(super) async fn validate_id_token(
    client: &reqwest::Client,
    jwt: &str,
    audience: &str,
    nonce: Option<&str>,
) -> Result<Value> {
    let jwks: Value = client
        .get(format!("{ISSUER}/.well-known/jwks.json"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    verify_jwt(jwt, audience, nonce, &jwks)
}

pub(super) fn verify_jwt(
    jwt: &str,
    audience: &str,
    nonce: Option<&str>,
    jwks: &Value,
) -> Result<Value> {
    let parts: Vec<_> = jwt.split('.').collect();
    ensure!(parts.len() == 3 && jwt.len() < 32_000, "Invalid ID token");
    let header: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0])?)?;
    ensure!(
        header["alg"] == "RS256" && header.get("crit").is_none(),
        "Unsupported ID token signature algorithm"
    );
    let kid = header["kid"].as_str().context("ID token missing key ID")?;
    let key = jwks["keys"]
        .as_array()
        .context("Invalid OpenAI JWKS")?
        .iter()
        .find(|k| k["kid"].as_str() == Some(kid) && k["kty"] == "RSA")
        .context("Unknown ID token signing key")?;
    ensure!(
        key.get("use").is_none_or(|v| v == "sig") && key.get("alg").is_none_or(|v| v == "RS256"),
        "Invalid ID token signing key"
    );
    let n = URL_SAFE_NO_PAD.decode(key["n"].as_str().context("Missing RSA modulus")?)?;
    let e = URL_SAFE_NO_PAD.decode(key["e"].as_str().context("Missing RSA exponent")?)?;
    let signed = format!("{}.{}", parts[0], parts[1]);
    signature::RsaPublicKeyComponents { n: &n, e: &e }
        .verify(
            &signature::RSA_PKCS1_2048_8192_SHA256,
            signed.as_bytes(),
            &URL_SAFE_NO_PAD.decode(parts[2])?,
        )
        .map_err(|_| anyhow::anyhow!("ID token signature validation failed"))?;
    let claims: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1])?)?;
    validate_claims(&claims, audience, nonce)?;
    Ok(claims)
}

pub(super) fn validate_claims(claims: &Value, audience: &str, nonce: Option<&str>) -> Result<()> {
    ensure!(claims["iss"] == ISSUER, "ID token issuer mismatch");
    let aud = &claims["aud"];
    ensure!(
        aud.as_str() == Some(audience)
            || aud
                .as_array()
                .is_some_and(|v| v.iter().any(|s| s.as_str() == Some(audience))),
        "ID token audience mismatch"
    );
    if aud.as_array().is_some_and(|v| v.len() > 1) {
        ensure!(
            claims["azp"] == audience,
            "ID token authorized party mismatch"
        );
    }
    ensure!(
        claims["exp"].as_u64().is_some_and(|v| v > now()),
        "ID token expired"
    );
    ensure!(
        claims["iat"].as_u64().is_some_and(|v| v <= now() + 60),
        "Invalid ID token issue time"
    );
    ensure!(
        claims
            .get("nbf")
            .is_none_or(|v| v.as_u64().is_some_and(|t| t <= now())),
        "ID token is not yet valid"
    );
    if let Some(nonce) = nonce {
        ensure!(
            claims["nonce"]
                .as_str()
                .is_some_and(|v| secure_equal(v, nonce)),
            "ID token nonce mismatch"
        );
    }
    ensure!(
        claims["sub"].as_str().is_some_and(|v| !v.is_empty()),
        "ID token has no subject"
    );
    Ok(())
}
