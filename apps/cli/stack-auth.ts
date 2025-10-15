import { createServer } from "node:http";

interface StackAuthConfig {
  appUrl: string;
  projectId: string;
  publishableClientKey: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function promptCliLogin(
  config: StackAuthConfig
): Promise<string | null> {
  return new Promise((resolve) => {
    const port = 31954;
    let resolved = false;

    const server = createServer(async (req, res) => {
      if (req.url?.startsWith("/callback")) {
        const url = new URL(req.url, `http://localhost:${port}`);
        const code = url.searchParams.get("code");

        if (code) {
          try {
            // Exchange code for tokens
            const tokenResponse = await fetch(
              `${config.appUrl}/api/v1/auth/oauth/token`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-stack-publishable-client-key": config.publishableClientKey,
                  "x-stack-project-id": config.projectId,
                },
                body: JSON.stringify({
                  grant_type: "authorization_code",
                  code,
                  redirect_uri: `http://localhost:${port}/callback`,
                }),
              }
            );

            if (tokenResponse.ok) {
              const tokens = (await tokenResponse.json()) as TokenResponse;
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>Authentication Successful</title>
                    <style>
                      body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #f5f5f5;
                      }
                      .container {
                        text-align: center;
                        background: white;
                        padding: 2rem;
                        border-radius: 8px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                      }
                      h1 { color: #22c55e; margin-bottom: 1rem; }
                      p { color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <h1>✓ Authentication Successful</h1>
                      <p>You can now close this window and return to the CLI.</p>
                    </div>
                  </body>
                </html>
              `);

              if (!resolved) {
                resolved = true;
                setTimeout(() => {
                  server.close();
                  resolve(tokens.refresh_token);
                }, 1000);
              }
            } else {
              throw new Error("Failed to exchange code for tokens");
            }
          } catch (error) {
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Authentication Failed</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      height: 100vh;
                      margin: 0;
                      background: #f5f5f5;
                    }
                    .container {
                      text-align: center;
                      background: white;
                      padding: 2rem;
                      border-radius: 8px;
                      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    }
                    h1 { color: #ef4444; margin-bottom: 1rem; }
                    p { color: #666; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>✗ Authentication Failed</h1>
                    <p>Please try again or check the CLI for error details.</p>
                  </div>
                </body>
              </html>
            `);

            if (!resolved) {
              resolved = true;
              setTimeout(() => {
                server.close();
                resolve(null);
              }, 2000);
            }
          }
        } else {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing authorization code");

          if (!resolved) {
            resolved = true;
            setTimeout(() => {
              server.close();
              resolve(null);
            }, 1000);
          }
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });

    server.listen(port, () => {
      const authUrl = new URL(`${config.appUrl}/handler/sign-in`);
      authUrl.searchParams.set("client_id", config.projectId);
      authUrl.searchParams.set("redirect_uri", `http://localhost:${port}/callback`);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid profile email");

      console.log("\nPlease open the following URL in your browser to authenticate:\n");
      console.log(`  ${authUrl.toString()}\n`);
      console.log("Waiting for authentication...\n");
    });

    // Handle timeout (5 minutes)
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        resolve(null);
      }
    }, 5 * 60 * 1000);
  });
}

export async function getAccessToken(
  refreshToken: string,
  config: Pick<StackAuthConfig, "appUrl">
): Promise<string> {
  const response = await fetch(`${config.appUrl}/api/v1/auth/sessions/current/refresh`, {
    method: "POST",
    headers: {
      "x-stack-refresh-token": refreshToken,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to refresh access token");
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function getUserObject(
  accessToken: string,
  config: Pick<StackAuthConfig, "appUrl">
): Promise<{
  id: string;
  display_name?: string;
  primary_email?: string;
}> {
  const response = await fetch(`${config.appUrl}/api/v1/users/me`, {
    method: "GET",
    headers: {
      "x-stack-access-token": accessToken,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get user object");
  }

  return (await response.json()) as {
    id: string;
    display_name?: string;
    primary_email?: string;
  };
}
