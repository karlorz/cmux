import { describe, expect, it } from "vitest";
import {
  getConfiguredOriginHostnames,
  getConfiguredOrigins,
} from "./configured-origins";

describe("configured origins helpers", () => {
  it("normalizes and dedupes comma-separated origins", () => {
    expect(
      getConfiguredOrigins([
        "https://cmux.karldigi.dev, cmux.karldigi.dev",
        "https://cmux-www.karldigi.dev",
      ]),
    ).toEqual([
      "https://cmux.karldigi.dev",
      "https://cmux-www.karldigi.dev",
    ]);
  });

  it("extracts hostnames from configured origins", () => {
    expect(
      getConfiguredOriginHostnames([
        "https://cmux.karldigi.dev,https://preview.karldigi.dev",
        "https://cmux-www.karldigi.dev",
      ]),
    ).toEqual([
      "cmux.karldigi.dev",
      "preview.karldigi.dev",
      "cmux-www.karldigi.dev",
    ]);
  });
});
