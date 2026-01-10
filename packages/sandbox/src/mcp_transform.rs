//! MCP configuration transformation for sandbox environments.
//!
//! This module transforms MCP (Model Context Protocol) server configurations
//! from local "Launch Mode" (spawns new browser) to remote "Connect Mode"
//! (connects to existing browser via CDP proxy).
//!
//! In sandbox environments, Chrome is already running with DevTools exposed:
//! - Chrome listens on port 39382 (internal)
//! - CDP Proxy listens on port 39381 (handles Host header validation)
//!
//! MCP servers like chrome-devtools-mcp need `--browserUrl=http://localhost:39381`
//! to connect to the existing browser instead of spawning a new one.

use serde_json::Value as JsonValue;

/// The port where the CDP proxy listens in sandbox environments.
pub const SANDBOX_CDP_PROXY_PORT: u16 = 39381;

/// The browser URL to inject for connecting to the sandbox Chrome instance.
pub fn sandbox_browser_url() -> String {
    format!("http://localhost:{}", SANDBOX_CDP_PROXY_PORT)
}

/// MCP server names that require browser URL injection.
/// These servers use Chrome DevTools Protocol and need to connect to an existing browser.
const CDP_MCP_SERVERS: &[&str] = &[
    "chrome-devtools",
    "chrome-devtools-mcp",
    "playwright-mcp",
    "puppeteer-mcp",
];

/// Check if an MCP server name indicates it needs CDP browser URL injection.
fn is_cdp_mcp_server(name: &str) -> bool {
    let name_lower = name.to_lowercase();
    CDP_MCP_SERVERS
        .iter()
        .any(|&s| name_lower.contains(s) || name_lower == s)
}

/// Check if args already contain a browser URL argument.
fn has_browser_url_arg(args: &[String]) -> bool {
    args.iter().any(|arg| {
        arg.starts_with("--browserUrl=")
            || arg.starts_with("-u=")
            || arg.starts_with("--browserUrl")
            || arg == "-u"
            || arg.starts_with("--wsEndpoint=")
            || arg.starts_with("-w=")
    })
}

/// Transform Claude Code MCP configuration JSON for sandbox environment.
///
/// Input format (Claude Code ~/.claude/.mcp.json or .mcp.json):
/// ```json
/// {
///   "mcpServers": {
///     "chrome-devtools": {
///       "command": "bunx",
///       "args": ["chrome-devtools-mcp@latest"]
///     }
///   }
/// }
/// ```
///
/// Output: Same structure but with `--browserUrl=http://localhost:39381` added
/// to args for CDP-based MCP servers.
pub fn transform_claude_mcp_json(content: &str) -> Result<String, String> {
    let mut doc: JsonValue =
        serde_json::from_str(content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let browser_url = sandbox_browser_url();

    if let Some(servers) = doc.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        for (name, server) in servers.iter_mut() {
            if !is_cdp_mcp_server(name) {
                continue;
            }

            if let Some(args) = server.get_mut("args").and_then(|v| v.as_array_mut()) {
                // Convert to strings to check existing args
                let args_strings: Vec<String> = args
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();

                if !has_browser_url_arg(&args_strings) {
                    args.push(JsonValue::String(format!("--browserUrl={}", browser_url)));
                }
            }
        }
    }

    serde_json::to_string_pretty(&doc).map_err(|e| format!("Failed to serialize JSON: {}", e))
}

/// Transform Codex CLI MCP configuration TOML for sandbox environment.
///
/// Input format (Codex ~/.codex/config.toml):
/// ```toml
/// [mcp_servers.chrome-devtools]
/// command = "bunx"
/// args = ["chrome-devtools-mcp@latest"]
/// ```
///
/// Output: Same structure but with `--browserUrl=http://localhost:39381` added
/// to args for CDP-based MCP servers.
pub fn transform_codex_mcp_toml(content: &str) -> Result<String, String> {
    let mut doc: toml::Table = content
        .parse()
        .map_err(|e| format!("Failed to parse TOML: {}", e))?;

    let browser_url = sandbox_browser_url();

    if let Some(mcp_servers) = doc.get_mut("mcp_servers").and_then(|v| v.as_table_mut()) {
        for (name, server) in mcp_servers.iter_mut() {
            if !is_cdp_mcp_server(name) {
                continue;
            }

            if let Some(server_table) = server.as_table_mut() {
                if let Some(args) = server_table.get_mut("args").and_then(|v| v.as_array_mut()) {
                    // Convert to strings to check existing args
                    let args_strings: Vec<String> = args
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();

                    if !has_browser_url_arg(&args_strings) {
                        args.push(toml::Value::String(format!("--browserUrl={}", browser_url)));
                    }
                }
            }
        }
    }

    Ok(toml::to_string_pretty(&doc).map_err(|e| format!("Failed to serialize TOML: {}", e))?)
}

/// Transform Gemini CLI MCP configuration JSON for sandbox environment.
///
/// Gemini settings.json may have an mcpServers section similar to Claude.
/// This function transforms it the same way.
pub fn transform_gemini_mcp_json(content: &str) -> Result<String, String> {
    // Gemini uses a similar format to Claude for MCP servers
    transform_claude_mcp_json(content)
}

/// Transform Amp settings.json for sandbox environment.
///
/// Amp may have MCP server configurations that need transformation.
pub fn transform_amp_mcp_json(content: &str) -> Result<String, String> {
    // Amp uses a similar format to Claude for MCP servers
    transform_claude_mcp_json(content)
}

/// Generic MCP JSON transformation that handles various formats.
///
/// This function attempts to find and transform MCP server configurations
/// in JSON documents that may have different structures:
/// - `mcpServers` (Claude, Gemini)
/// - `mcp_servers` (alternative naming)
/// - `servers` (generic)
pub fn transform_generic_mcp_json(content: &str) -> Result<String, String> {
    let mut doc: JsonValue =
        serde_json::from_str(content).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let browser_url = sandbox_browser_url();

    // Try different possible keys for MCP servers
    let server_keys = ["mcpServers", "mcp_servers", "servers"];

    for key in server_keys {
        if let Some(servers) = doc.get_mut(key).and_then(|v| v.as_object_mut()) {
            for (name, server) in servers.iter_mut() {
                if !is_cdp_mcp_server(name) {
                    continue;
                }

                if let Some(args) = server.get_mut("args").and_then(|v| v.as_array_mut()) {
                    let args_strings: Vec<String> = args
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();

                    if !has_browser_url_arg(&args_strings) {
                        args.push(JsonValue::String(format!("--browserUrl={}", browser_url)));
                    }
                }
            }
        }
    }

    serde_json::to_string_pretty(&doc).map_err(|e| format!("Failed to serialize JSON: {}", e))
}

/// Mapping of sandbox paths to their transformation functions.
pub fn get_mcp_transformer(sandbox_path: &str) -> Option<fn(&str) -> Result<String, String>> {
    match sandbox_path {
        // Claude Code MCP configs
        "/root/.claude/.mcp.json" => Some(transform_claude_mcp_json),
        // Codex CLI config (already handles notify, now also MCP)
        "/root/.codex/config.toml" => Some(transform_codex_mcp_toml),
        // Gemini CLI settings
        "/root/.gemini/settings.json" => Some(transform_gemini_mcp_json),
        // Amp settings
        "/root/.config/amp/settings.json" => Some(transform_amp_mcp_json),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_claude_mcp_json_adds_browser_url() {
        let input = r#"{
  "mcpServers": {
    "chrome-devtools": {
      "command": "bunx",
      "args": ["chrome-devtools-mcp@latest"]
    }
  }
}"#;

        let result = transform_claude_mcp_json(input).unwrap();
        let parsed: JsonValue = serde_json::from_str(&result).unwrap();

        let args = parsed["mcpServers"]["chrome-devtools"]["args"]
            .as_array()
            .unwrap();
        assert_eq!(args.len(), 2);
        assert_eq!(
            args[1].as_str().unwrap(),
            "--browserUrl=http://localhost:39381"
        );
    }

    #[test]
    fn test_transform_claude_mcp_json_preserves_existing_browser_url() {
        let input = r#"{
  "mcpServers": {
    "chrome-devtools": {
      "command": "bunx",
      "args": ["chrome-devtools-mcp@latest", "--browserUrl=http://custom:9222"]
    }
  }
}"#;

        let result = transform_claude_mcp_json(input).unwrap();
        let parsed: JsonValue = serde_json::from_str(&result).unwrap();

        let args = parsed["mcpServers"]["chrome-devtools"]["args"]
            .as_array()
            .unwrap();
        // Should not add another --browserUrl
        assert_eq!(args.len(), 2);
        assert_eq!(args[1].as_str().unwrap(), "--browserUrl=http://custom:9222");
    }

    #[test]
    fn test_transform_claude_mcp_json_ignores_non_cdp_servers() {
        let input = r#"{
  "mcpServers": {
    "filesystem": {
      "command": "bunx",
      "args": ["@anthropic/mcp-server-filesystem@latest"]
    }
  }
}"#;

        let result = transform_claude_mcp_json(input).unwrap();
        let parsed: JsonValue = serde_json::from_str(&result).unwrap();

        let args = parsed["mcpServers"]["filesystem"]["args"]
            .as_array()
            .unwrap();
        // Should not modify non-CDP servers
        assert_eq!(args.len(), 1);
    }

    #[test]
    fn test_transform_codex_mcp_toml_adds_browser_url() {
        let input = r#"
[mcp_servers.chrome-devtools]
command = "bunx"
args = ["chrome-devtools-mcp@latest"]
"#;

        let result = transform_codex_mcp_toml(input).unwrap();
        let parsed: toml::Table = result.parse().unwrap();

        let args = parsed["mcp_servers"]["chrome-devtools"]["args"]
            .as_array()
            .unwrap();
        assert_eq!(args.len(), 2);
        assert_eq!(
            args[1].as_str().unwrap(),
            "--browserUrl=http://localhost:39381"
        );
    }

    #[test]
    fn test_transform_codex_mcp_toml_preserves_notify() {
        let input = r#"
notify = ["sh", "-c", "echo notify"]

[mcp_servers.chrome-devtools]
command = "bunx"
args = ["chrome-devtools-mcp@latest"]
"#;

        let result = transform_codex_mcp_toml(input).unwrap();
        let parsed: toml::Table = result.parse().unwrap();

        // Should preserve notify block
        assert!(parsed.get("notify").is_some());

        // Should also add browser URL
        let args = parsed["mcp_servers"]["chrome-devtools"]["args"]
            .as_array()
            .unwrap();
        assert_eq!(args.len(), 2);
    }

    #[test]
    fn test_is_cdp_mcp_server() {
        assert!(is_cdp_mcp_server("chrome-devtools"));
        assert!(is_cdp_mcp_server("chrome-devtools-mcp"));
        assert!(is_cdp_mcp_server("Chrome-DevTools")); // case insensitive
        assert!(is_cdp_mcp_server("my-chrome-devtools-server"));
        assert!(!is_cdp_mcp_server("filesystem"));
        assert!(!is_cdp_mcp_server("github"));
    }

    #[test]
    fn test_has_browser_url_arg() {
        assert!(has_browser_url_arg(&[
            "--browserUrl=http://localhost:9222".to_string()
        ]));
        assert!(has_browser_url_arg(&[
            "-u=http://localhost:9222".to_string()
        ]));
        assert!(has_browser_url_arg(&[
            "--wsEndpoint=ws://localhost:9222".to_string()
        ]));
        assert!(!has_browser_url_arg(&[
            "chrome-devtools-mcp@latest".to_string()
        ]));
    }

    #[test]
    fn test_transform_empty_mcp_servers() {
        let input = r#"{"mcpServers": {}}"#;
        let result = transform_claude_mcp_json(input).unwrap();
        let parsed: JsonValue = serde_json::from_str(&result).unwrap();
        assert!(parsed["mcpServers"].as_object().unwrap().is_empty());
    }

    #[test]
    fn test_transform_no_mcp_servers_key() {
        let input = r#"{"other": "config"}"#;
        let result = transform_claude_mcp_json(input).unwrap();
        let parsed: JsonValue = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["other"].as_str().unwrap(), "config");
    }
}
