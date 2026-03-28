import { describe, expect, it } from "vitest";
import { getVaultReaderSidebarAction } from "./vault-reader-sidebar";

describe("getVaultReaderSidebarAction", () => {
  it("hides the shell sidebar when a shared note opens into reader mode", () => {
    expect(
      getVaultReaderSidebarAction({
        previousNotePath: undefined,
        nextNotePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
        isSidebarHidden: false,
        autoHiddenForReader: false,
      })
    ).toBe("hide");
  });

  it("does not hide the shell sidebar again when it is already hidden", () => {
    expect(
      getVaultReaderSidebarAction({
        previousNotePath: undefined,
        nextNotePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
        isSidebarHidden: true,
        autoHiddenForReader: false,
      })
    ).toBe("none");
  });

  it("restores the shell sidebar after closing a note that auto-entered reader mode", () => {
    expect(
      getVaultReaderSidebarAction({
        previousNotePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
        nextNotePath: undefined,
        isSidebarHidden: true,
        autoHiddenForReader: true,
      })
    ).toBe("show");
  });

  it("leaves the sidebar alone when a note closes without auto-reader mode", () => {
    expect(
      getVaultReaderSidebarAction({
        previousNotePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
        nextNotePath: undefined,
        isSidebarHidden: false,
        autoHiddenForReader: false,
      })
    ).toBe("none");
  });

  it("keeps the current shell layout when switching between notes", () => {
    expect(
      getVaultReaderSidebarAction({
        previousNotePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
        nextNotePath: "5️⃣-Projects/GitHub/cmux/cmux-deep-research.md",
        isSidebarHidden: true,
        autoHiddenForReader: true,
      })
    ).toBe("none");
  });
});
