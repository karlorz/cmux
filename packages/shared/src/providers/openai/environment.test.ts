import { describe, expect, it } from "vitest";
import { stripFilteredConfigKeys } from "./environment";

describe("stripFilteredConfigKeys", () => {
  it("removes model and model_reasoning_effort while preserving other keys and sections", () => {
    const input = `model = "gpt-5.2"
model_reasoning_effort = "high"
custom_model = "keep"
notify = ["x"]

[notice]
foo = "bar"
`;

    const output = stripFilteredConfigKeys(input);
    expect(output).not.toContain('model = "gpt-5.2"');
    expect(output).not.toContain('model_reasoning_effort = "high"');
    expect(output).toContain('custom_model = "keep"');
    expect(output).toContain('notify = ["x"]');
    expect(output).toContain("[notice]");
    expect(output).toContain('foo = "bar"');
  });

  it("handles whitespace and inline comments", () => {
    const input = `  model="gpt-5.2" # comment
\tmodel_reasoning_effort = "xhigh"    # comment
keep = 1
`;

    const output = stripFilteredConfigKeys(input);
    expect(output).not.toContain("model=");
    expect(output).not.toContain("model_reasoning_effort");
    expect(output).toBe("keep = 1");
  });

  it("removes multi-line array assignments", () => {
    const input = `model = [
  "gpt-5.2",
]
other = "ok"
`;

    const output = stripFilteredConfigKeys(input);
    expect(output).toBe('other = "ok"');
  });

  it("removes multi-line string assignments", () => {
    const input = `model_reasoning_effort = \"\"\"high
xhigh
\"\"\"
keep = true
`;

    const output = stripFilteredConfigKeys(input);
    expect(output).toBe("keep = true");
  });
});

