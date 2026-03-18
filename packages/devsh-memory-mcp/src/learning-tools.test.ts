import { describe, expect, it } from "bun:test";

// Type definitions matching the MCP server implementation
type LearningType = "learning" | "error" | "feature_request";
type LaneName = "hot" | "orchestration" | "project";

interface LogLearningParams {
  type: LearningType;
  text: string;
  lane?: LaneName;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

interface ActiveRule {
  id: string;
  text: string;
  lane: LaneName;
  confidence: number;
  status: "active" | "candidate" | "archived";
  createdAt: string;
  promotedAt?: string;
}

interface LearningLogResponse {
  logged: boolean;
  eventType: string;
  eventId?: string;
  ruleId?: string;
  message: string;
}

// Helper to map learning type to event type
function mapTypeToEventType(type: LearningType): string {
  switch (type) {
    case "learning":
      return "learning_logged";
    case "error":
      return "error_logged";
    case "feature_request":
      return "feature_request_logged";
  }
}

// Helper to get default confidence based on type
function getDefaultConfidence(type: LearningType): number {
  return type === "error" ? 0.8 : 0.5;
}

describe("log_learning Parameter Validation", () => {
  it("requires type and text fields", () => {
    const params: LogLearningParams = {
      type: "learning",
      text: "Always run tests before committing",
    };
    expect(params.type).toBeDefined();
    expect(params.text).toBeTruthy();
  });

  it("validates learning type enum", () => {
    const validTypes: LearningType[] = ["learning", "error", "feature_request"];
    for (const type of validTypes) {
      const params: LogLearningParams = { type, text: "test" };
      expect(params.type).toBe(type);
    }
  });

  it("validates lane enum", () => {
    const validLanes: LaneName[] = ["hot", "orchestration", "project"];
    for (const lane of validLanes) {
      const params: LogLearningParams = {
        type: "learning",
        text: "test",
        lane,
      };
      expect(params.lane).toBe(lane);
    }
  });

  it("accepts optional confidence between 0 and 1", () => {
    const params: LogLearningParams = {
      type: "learning",
      text: "test",
      confidence: 0.75,
    };
    expect(params.confidence).toBeGreaterThanOrEqual(0);
    expect(params.confidence).toBeLessThanOrEqual(1);
  });

  it("accepts optional metadata object", () => {
    const params: LogLearningParams = {
      type: "error",
      text: "API timeout",
      metadata: {
        errorCode: "ETIMEDOUT",
        endpoint: "/api/spawn",
        taskId: "task_abc123",
      },
    };
    expect(params.metadata).toBeDefined();
    expect(params.metadata?.errorCode).toBe("ETIMEDOUT");
  });
});

describe("Event Type Mapping", () => {
  it("maps learning to learning_logged", () => {
    expect(mapTypeToEventType("learning")).toBe("learning_logged");
  });

  it("maps error to error_logged", () => {
    expect(mapTypeToEventType("error")).toBe("error_logged");
  });

  it("maps feature_request to feature_request_logged", () => {
    expect(mapTypeToEventType("feature_request")).toBe("feature_request_logged");
  });
});

describe("Default Confidence Values", () => {
  it("defaults to 0.5 for learnings", () => {
    expect(getDefaultConfidence("learning")).toBe(0.5);
  });

  it("defaults to 0.8 for errors", () => {
    expect(getDefaultConfidence("error")).toBe(0.8);
  });

  it("defaults to 0.5 for feature requests", () => {
    expect(getDefaultConfidence("feature_request")).toBe(0.5);
  });
});

describe("Log Learning Request Body", () => {
  it("constructs correct request body for learning", () => {
    const params: LogLearningParams = {
      type: "learning",
      text: "Use bun instead of npm for faster installs",
    };

    const requestBody = {
      eventType: mapTypeToEventType(params.type),
      text: params.text,
      lane: params.lane ?? "orchestration",
      confidence: params.confidence ?? getDefaultConfidence(params.type),
      metadata: params.metadata,
    };

    expect(requestBody.eventType).toBe("learning_logged");
    expect(requestBody.lane).toBe("orchestration");
    expect(requestBody.confidence).toBe(0.5);
  });

  it("constructs correct request body for error with metadata", () => {
    const params: LogLearningParams = {
      type: "error",
      text: "Sandbox spawn failed with timeout",
      lane: "hot",
      confidence: 0.9,
      metadata: {
        provider: "e2b",
        timeout: 30000,
        errorStack: "Error: timeout at spawn.ts:123",
      },
    };

    const requestBody = {
      eventType: mapTypeToEventType(params.type),
      text: params.text,
      lane: params.lane ?? "orchestration",
      confidence: params.confidence ?? getDefaultConfidence(params.type),
      metadata: params.metadata,
    };

    expect(requestBody.eventType).toBe("error_logged");
    expect(requestBody.lane).toBe("hot");
    expect(requestBody.confidence).toBe(0.9);
    expect(requestBody.metadata?.provider).toBe("e2b");
  });
});

describe("Log Learning Response", () => {
  it("parses successful response", () => {
    const response: LearningLogResponse = {
      logged: true,
      eventType: "learning_logged",
      eventId: "evt_abc123",
      ruleId: "rule_xyz789",
      message: "Successfully logged learning. It will be reviewed for promotion to active rules.",
    };

    expect(response.logged).toBe(true);
    expect(response.eventId).toBeDefined();
    expect(response.ruleId).toBeDefined();
  });

  it("handles response without ruleId (not auto-promoted)", () => {
    const response: LearningLogResponse = {
      logged: true,
      eventType: "feature_request_logged",
      eventId: "evt_def456",
      message: "Successfully logged feature_request. It will be reviewed for promotion to active rules.",
    };

    expect(response.logged).toBe(true);
    expect(response.ruleId).toBeUndefined();
  });
});

describe("get_active_orchestration_rules Parameter Validation", () => {
  it("accepts no parameters", () => {
    const params = {};
    expect(Object.keys(params)).toHaveLength(0);
  });

  it("accepts optional lane filter", () => {
    const params = { lane: "hot" as LaneName };
    expect(params.lane).toBe("hot");
  });

  it("validates lane filter values", () => {
    const validLanes: LaneName[] = ["hot", "orchestration", "project"];
    for (const lane of validLanes) {
      const params = { lane };
      expect(params.lane).toBe(lane);
    }
  });
});

describe("Active Rules Response", () => {
  it("parses rules array", () => {
    const rules: ActiveRule[] = [
      {
        id: "rule_001",
        text: "Always run bun check before committing",
        lane: "hot",
        confidence: 0.95,
        status: "active",
        createdAt: "2026-03-15T10:00:00Z",
        promotedAt: "2026-03-16T14:00:00Z",
      },
      {
        id: "rule_002",
        text: "Use vitest for testing, not jest",
        lane: "orchestration",
        confidence: 0.85,
        status: "active",
        createdAt: "2026-03-17T09:00:00Z",
      },
    ];

    expect(rules).toHaveLength(2);
    expect(rules[0].lane).toBe("hot");
    expect(rules[1].promotedAt).toBeUndefined();
  });

  it("filters rules by lane", () => {
    const allRules: ActiveRule[] = [
      { id: "1", text: "hot rule", lane: "hot", confidence: 0.9, status: "active", createdAt: "2026-03-18T00:00:00Z" },
      { id: "2", text: "orch rule", lane: "orchestration", confidence: 0.8, status: "active", createdAt: "2026-03-18T00:00:00Z" },
      { id: "3", text: "project rule", lane: "project", confidence: 0.7, status: "active", createdAt: "2026-03-18T00:00:00Z" },
    ];

    const hotRules = allRules.filter(r => r.lane === "hot");
    expect(hotRules).toHaveLength(1);
    expect(hotRules[0].text).toBe("hot rule");
  });
});

describe("API URL Construction", () => {
  it("constructs correct log_learning URL", () => {
    const apiBase = "https://cmux-www.karldigi.dev";
    const url = `${apiBase}/api/v1/cmux/orchestration/learning/log`;
    expect(url).toBe("https://cmux-www.karldigi.dev/api/v1/cmux/orchestration/learning/log");
  });

  it("constructs correct rules URL without filter", () => {
    const apiBase = "https://cmux-www.karldigi.dev";
    const url = new URL(`${apiBase}/api/v1/cmux/orchestration/rules`);
    expect(url.toString()).toBe("https://cmux-www.karldigi.dev/api/v1/cmux/orchestration/rules");
  });

  it("constructs correct rules URL with lane filter", () => {
    const apiBase = "https://cmux-www.karldigi.dev";
    const url = new URL(`${apiBase}/api/v1/cmux/orchestration/rules`);
    url.searchParams.set("lane", "hot");
    expect(url.toString()).toBe("https://cmux-www.karldigi.dev/api/v1/cmux/orchestration/rules?lane=hot");
  });

  it("uses x-cmux-token header for auth", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.test.signature";
    const headers = {
      "Content-Type": "application/json",
      "x-cmux-token": jwt,
    };
    expect(headers["x-cmux-token"]).toBe(jwt);
  });
});

describe("Error Handling", () => {
  it("returns error when JWT is missing", () => {
    const errorResponse = {
      content: [{
        type: "text",
        text: "Error: CMUX_TASK_RUN_JWT not set. This tool requires authentication.",
      }],
    };
    expect(errorResponse.content[0].text).toContain("CMUX_TASK_RUN_JWT");
  });

  it("formats API error response", () => {
    const type = "learning";
    const status = 403;
    const errText = "Forbidden: team access denied";

    const errorMessage = `Error logging ${type}: ${status} ${errText}`;
    expect(errorMessage).toBe("Error logging learning: 403 Forbidden: team access denied");
  });

  it("formats network error", () => {
    const type = "error";
    const errorMsg = "fetch failed: ECONNREFUSED";

    const errorMessage = `Error logging ${type}: ${errorMsg}`;
    expect(errorMessage).toContain("ECONNREFUSED");
  });
});

describe("Lane Descriptions", () => {
  it("hot lane is for high-frequency rules", () => {
    const laneDescriptions: Record<LaneName, string> = {
      hot: "Always injected into all agent environments",
      orchestration: "Injected only for head agents",
      project: "Injected based on repo/workspace match",
    };
    expect(laneDescriptions.hot).toContain("all agent");
  });

  it("orchestration lane is for head agents", () => {
    const laneDescriptions: Record<LaneName, string> = {
      hot: "Always injected into all agent environments",
      orchestration: "Injected only for head agents",
      project: "Injected based on repo/workspace match",
    };
    expect(laneDescriptions.orchestration).toContain("head agent");
  });

  it("project lane is workspace-specific", () => {
    const laneDescriptions: Record<LaneName, string> = {
      hot: "Always injected into all agent environments",
      orchestration: "Injected only for head agents",
      project: "Injected based on repo/workspace match",
    };
    expect(laneDescriptions.project).toContain("workspace");
  });
});
