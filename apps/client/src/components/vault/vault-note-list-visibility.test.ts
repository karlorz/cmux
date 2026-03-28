// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getInitialVaultNoteListVisibility,
  persistVaultNoteListVisibility,
  readStoredVaultNoteListVisibility,
} from "./vault-note-list-visibility";

describe("vault-note-list-visibility", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to hidden note list when a note is open and no preference is stored", () => {
    expect(
      getInitialVaultNoteListVisibility({
        teamSlugOrId: "dev",
        notePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      })
    ).toBe(false);
  });

  it("always shows the note list when no note is selected", () => {
    persistVaultNoteListVisibility("dev", false);

    expect(
      getInitialVaultNoteListVisibility({
        teamSlugOrId: "dev",
      })
    ).toBe(true);
  });

  it("reads and persists the note-list visibility per team", () => {
    persistVaultNoteListVisibility("dev", true);
    persistVaultNoteListVisibility("other-team", false);

    expect(readStoredVaultNoteListVisibility("dev")).toBe(true);
    expect(readStoredVaultNoteListVisibility("other-team")).toBe(false);
    expect(
      getInitialVaultNoteListVisibility({
        teamSlugOrId: "dev",
        notePath: "5️⃣-Projects/GitHub/cmux/_Overview.md",
      })
    ).toBe(true);
  });
});
