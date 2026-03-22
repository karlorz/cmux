import { describe, expect, it } from "vitest";
import { detectIntentBoosts } from "./mcpTools";

describe("mcpTools", () => {
  describe("detectIntentBoosts", () => {
    describe("documentation intent", () => {
      it("detects 'how to' questions", () => {
        const boosts = detectIntentBoosts("how to use hooks");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'how to' with code keywords (cumulative)", () => {
        // "how to" gives doc +3, "implement" gives code +2 and doc +1
        const boosts = detectIntentBoosts("how to implement authentication");
        expect(boosts.documentation).toBe(4); // 3 + 1
        expect(boosts.code).toBe(2);
      });

      it("detects 'how do' questions", () => {
        const boosts = detectIntentBoosts("how do I use this API");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'what is' questions", () => {
        const boosts = detectIntentBoosts("what is a webhook");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'docs' keyword", () => {
        const boosts = detectIntentBoosts("check the docs for React hooks");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'documentation' keyword", () => {
        const boosts = detectIntentBoosts("read the documentation");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'tutorial' keyword", () => {
        const boosts = detectIntentBoosts("find a tutorial for TypeScript");
        expect(boosts.documentation).toBe(3);
      });

      it("detects 'example' keyword", () => {
        const boosts = detectIntentBoosts("show me an example");
        expect(boosts.documentation).toBe(3);
      });
    });

    describe("testing intent", () => {
      it("detects 'test' keyword", () => {
        const boosts = detectIntentBoosts("write a test for this function");
        expect(boosts.testing).toBe(3);
      });

      it("detects 'vitest' keyword", () => {
        const boosts = detectIntentBoosts("configure vitest for the project");
        expect(boosts.testing).toBe(3);
      });

      it("detects 'e2e' keyword", () => {
        const boosts = detectIntentBoosts("run e2e tests");
        expect(boosts.testing).toBe(3);
      });

      it("detects 'coverage' keyword", () => {
        const boosts = detectIntentBoosts("check test coverage");
        expect(boosts.testing).toBe(3);
      });
    });

    describe("deployment intent", () => {
      it("detects 'deploy' keyword", () => {
        const boosts = detectIntentBoosts("deploy to production");
        expect(boosts.deployment).toBe(3);
      });

      it("detects 'docker' keyword", () => {
        const boosts = detectIntentBoosts("create a docker image");
        expect(boosts.deployment).toBe(3);
      });

      it("detects 'kubernetes' keyword", () => {
        const boosts = detectIntentBoosts("kubernetes deployment config");
        expect(boosts.deployment).toBe(3);
      });

      it("detects 'ci' keyword", () => {
        const boosts = detectIntentBoosts("set up ci pipeline");
        expect(boosts.deployment).toBe(3);
      });
    });

    describe("memory intent", () => {
      it("detects 'remember' keyword", () => {
        const boosts = detectIntentBoosts("remember this for later");
        expect(boosts.memory).toBe(3);
      });

      it("detects 'recall' keyword", () => {
        const boosts = detectIntentBoosts("recall what we discussed");
        expect(boosts.memory).toBe(3);
      });

      it("detects 'context' keyword", () => {
        const boosts = detectIntentBoosts("use the context from before");
        expect(boosts.memory).toBe(3);
      });

      it("detects 'history' keyword", () => {
        const boosts = detectIntentBoosts("check the history");
        expect(boosts.memory).toBe(3);
      });
    });

    describe("code intent", () => {
      it("detects 'implement' keyword", () => {
        const boosts = detectIntentBoosts("implement a new feature");
        expect(boosts.code).toBe(2);
        expect(boosts.documentation).toBe(1); // Also gets doc boost
      });

      it("detects 'refactor' keyword", () => {
        const boosts = detectIntentBoosts("refactor this module");
        expect(boosts.code).toBe(2);
      });

      it("detects 'fix' keyword", () => {
        const boosts = detectIntentBoosts("fix the bug");
        expect(boosts.code).toBe(2);
      });

      it("detects 'bug' keyword", () => {
        const boosts = detectIntentBoosts("there is a bug in the code");
        expect(boosts.code).toBe(2);
      });
    });

    describe("planning intent", () => {
      it("detects 'plan' keyword", () => {
        const boosts = detectIntentBoosts("plan the architecture");
        expect(boosts.general).toBe(2);
      });

      it("detects 'analyze' keyword", () => {
        const boosts = detectIntentBoosts("analyze the performance");
        expect(boosts.general).toBe(2);
      });

      it("detects 'design' keyword", () => {
        const boosts = detectIntentBoosts("design the system");
        expect(boosts.general).toBe(2);
      });

      it("detects 'complex' keyword", () => {
        const boosts = detectIntentBoosts("this is a complex problem");
        expect(boosts.general).toBe(2);
      });
    });

    describe("multiple intents", () => {
      it("combines boosts from multiple patterns", () => {
        const boosts = detectIntentBoosts("how to test the deploy process");
        expect(boosts.documentation).toBe(3); // "how to"
        expect(boosts.testing).toBe(3); // "test"
        expect(boosts.deployment).toBe(3); // "deploy"
      });

      it("boosts from single pattern (explain and how to are in same regex)", () => {
        // Both "explain" and "how to" are in the same documentation pattern
        // so they only trigger once, giving +3
        const boosts = detectIntentBoosts("explain how to use this");
        expect(boosts.documentation).toBe(3);
      });

      it("accumulates boosts from code pattern on documentation", () => {
        // "docs" gives doc +3, "implement" gives code +2 and doc +1
        const boosts = detectIntentBoosts("check the docs to implement this");
        expect(boosts.documentation).toBe(4); // 3 + 1
        expect(boosts.code).toBe(2);
      });

      it("returns empty object for no matches", () => {
        const boosts = detectIntentBoosts("hello world");
        expect(Object.keys(boosts).length).toBe(0);
      });
    });

    describe("case insensitivity", () => {
      it("matches uppercase keywords", () => {
        const boosts = detectIntentBoosts("HOW TO USE THIS");
        expect(boosts.documentation).toBe(3);
      });

      it("matches mixed case keywords", () => {
        const boosts = detectIntentBoosts("Deploy To Production");
        expect(boosts.deployment).toBe(3);
      });
    });

    describe("word boundary matching", () => {
      it("requires word boundaries for matches", () => {
        // "testing" does not match "test" pattern due to word boundary \b
        const boosts = detectIntentBoosts("testing framework");
        expect(boosts.testing).toBeUndefined();
      });

      it("matches exact keyword with word boundaries", () => {
        const boosts = detectIntentBoosts("run the test suite");
        expect(boosts.testing).toBe(3);
      });

      it("matches words at start of string", () => {
        const boosts = detectIntentBoosts("deploy now");
        expect(boosts.deployment).toBe(3);
      });

      it("matches words at end of string", () => {
        const boosts = detectIntentBoosts("ready to deploy");
        expect(boosts.deployment).toBe(3);
      });
    });
  });
});
