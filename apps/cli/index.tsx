#!/usr/bin/env bun
import { render, Text, Box } from "ink";
import React, { useState, useEffect } from "react";
import { promptCliLogin, getAccessToken, getUserObject } from "./stack-auth.js";
import { createClient } from "@cmux/www-openapi-client/client";
import { getApiEnvironments } from "@cmux/www-openapi-client";
import type { GetEnvironmentResponse } from "@cmux/www-openapi-client";

const STACK_CONFIG = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:9779",
  projectId: process.env.NEXT_PUBLIC_STACK_PROJECT_ID || "",
  publishableClientKey: process.env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY || "",
};

interface AppState {
  status: "loading" | "authenticating" | "fetching" | "success" | "error";
  message?: string;
  user?: {
    id: string;
    displayName?: string;
    primaryEmail?: string;
  };
  environments?: Array<GetEnvironmentResponse>;
  error?: string;
}

function App() {
  const [state, setState] = useState<AppState>({
    status: "loading",
    message: "Initializing...",
  });

  useEffect(() => {
    async function authenticate() {
      try {
        setState({
          status: "authenticating",
          message: "Authenticating with Stack Auth...",
        });

        // Attempt to authenticate
        const refreshToken = await promptCliLogin(STACK_CONFIG);

        if (!refreshToken) {
          setState({
            status: "error",
            error: "Authentication cancelled or failed",
          });
          process.exit(1);
        }

        // Get access token
        const accessToken = await getAccessToken(refreshToken, STACK_CONFIG);

        // Get user info
        const user = await getUserObject(accessToken, STACK_CONFIG);

        setState((prev) => ({
          ...prev,
          status: "fetching",
          message: "Fetching environments...",
          user: {
            id: user.id,
            displayName: user.display_name,
            primaryEmail: user.primary_email,
          },
        }));

        // Create API client with access token
        const client = createClient({
          baseUrl: STACK_CONFIG.appUrl,
          headers: {
            "x-stack-access-token": accessToken,
          },
        });

        // Fetch environments for the user's team
        // Note: We need to get the team slug/id from somewhere
        // For now, we'll try to get the user's first team
        const teamSlugOrId = process.env.TEAM_SLUG_OR_ID || "personal";

        const result = await getApiEnvironments({
          client,
          query: {
            teamSlugOrId,
          },
        });

        if (result.error) {
          setState({
            status: "error",
            error: `Failed to fetch environments: ${JSON.stringify(result.error)}`,
          });
          return;
        }

        setState({
          status: "success",
          user: {
            id: user.id,
            displayName: user.display_name,
            primaryEmail: user.primary_email,
          },
          environments: result.data as Array<GetEnvironmentResponse>,
        });
      } catch (error) {
        setState({
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    authenticate();
  }, []);

  if (state.status === "loading" || state.status === "authenticating") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="blue">
          {state.message}
        </Text>
      </Box>
    );
  }

  if (state.status === "fetching") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">
          ✓ Authenticated as {state.user?.displayName || state.user?.primaryEmail}
        </Text>
        <Text color="blue">{state.message}</Text>
      </Box>
    );
  }

  if (state.status === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">
          ✗ Error: {state.error}
        </Text>
      </Box>
    );
  }

  // Success state
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">
        ✓ Authenticated as {state.user?.displayName || state.user?.primaryEmail}
      </Text>
      <Text color="gray">Email: {state.user?.primaryEmail}</Text>
      <Text> </Text>
      <Text bold color="cyan">
        Environments:
      </Text>
      {state.environments && state.environments.length > 0 ? (
        <Box flexDirection="column" marginLeft={2}>
          {state.environments.map((env) => (
            <Box key={env.id} flexDirection="column" marginY={1}>
              <Text bold>{env.name}</Text>
              <Text color="gray">  ID: {env.id}</Text>
              {env.description && (
                <Text color="gray">  Description: {env.description}</Text>
              )}
              {env.exposedPorts && env.exposedPorts.length > 0 && (
                <Text color="gray">
                  {"  "}Exposed Ports: {env.exposedPorts.join(", ")}
                </Text>
              )}
              <Text color="gray">
                {"  "}Created: {new Date(env.createdAt).toLocaleString()}
              </Text>
            </Box>
          ))}
        </Box>
      ) : (
        <Box marginLeft={2}>
          <Text color="gray">No environments found</Text>
        </Box>
      )}
    </Box>
  );
}

render(<App />);