use cmux_sandbox::models::{CreateSandboxRequest, ExecRequest};

#[tokio::test]
#[ignore]
async fn test_global_binaries_in_sandbox() {
    let client = reqwest::Client::new();
    let base_url = "http://127.0.0.1:46831";

    // Check health
    let health = client.get(format!("{}/healthz", base_url)).send().await;
    if health.is_err() || !health.unwrap().status().is_success() {
        eprintln!("Server not running at {}, skipping test. Make sure to run ./scripts/reload.sh first.", base_url);
        return;
    }

    // Create sandbox
    let create_req = CreateSandboxRequest {
        name: Some("binary-check".into()),
        workspace: None,
        read_only_paths: vec![],
        tmpfs: vec![],
        env: vec![],
    };

    let resp = client.post(format!("{}/sandboxes", base_url))
        .json(&create_req)
        .send()
        .await
        .expect("Failed to create sandbox");
    
    if !resp.status().is_success() {
        panic!("Failed to create sandbox: {}", resp.status());
    }

    let summary: serde_json::Value = resp.json().await.expect("Failed to parse sandbox summary");
    let id = summary["id"].as_str().expect("No ID in summary");

    // Check binaries
    let binaries = vec!["opencode", "gemini", "claude", "codex"];
    
    for bin in binaries {
        let exec_req = ExecRequest {
            command: vec!["which".into(), bin.into()],
            workdir: None,
            env: vec![],
        };
        
        let exec_resp = client.post(format!("{}/sandboxes/{}/exec", base_url, id))
            .json(&exec_req)
            .send()
            .await
            .expect("Failed to exec");
            
        let result: serde_json::Value = exec_resp.json().await.expect("Failed to parse exec response");
        let exit_code = result["exit_code"].as_i64().expect("No exit code");
        let stdout = result["stdout"].as_str().unwrap_or("");
        
        println!("Checking {}: exit_code={}, stdout={}", bin, exit_code, stdout.trim());
        assert_eq!(exit_code, 0, "Binary {} not found in sandbox (exit code {}). Stdout: {}", bin, exit_code, stdout);
        assert!(!stdout.trim().is_empty(), "Binary {} path is empty", bin);
    }

    // Cleanup
    let _ = client.delete(format!("{}/sandboxes/{}", base_url, id)).send().await;
}
