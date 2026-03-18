import { describe, it, expect } from "vitest";
import { parseDiff } from "./git-diff.js";

describe("parseDiff", () => {
  it("parses a simple diff with one file", () => {
    const diffText = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { foo } from "./foo";
+import { bar } from "./bar";

 export function main() {
`;

    const files = parseDiff(diffText);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/index.ts");
    expect(files[0].status).toBe("modified");
    expect(files[0].hunks).toHaveLength(1);
    expect(files[0].hunks[0].newStart).toBe(1);
    expect(files[0].hunks[0].newLines).toBe(4);
  });

  it("detects new files", () => {
    const diffText = `diff --git a/newfile.ts b/newfile.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+export const x = 1;
+export const y = 2;
+export const z = 3;
`;

    const files = parseDiff(diffText);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("newfile.ts");
    expect(files[0].status).toBe("added");
  });

  it("detects deleted files", () => {
    const diffText = `diff --git a/oldfile.ts b/oldfile.ts
deleted file mode 100644
index abc1234..0000000
--- a/oldfile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export const x = 1;
-export const y = 2;
-export const z = 3;
`;

    const files = parseDiff(diffText);

    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("oldfile.ts");
    expect(files[0].status).toBe("deleted");
  });

  it("parses multiple files", () => {
    const diffText = `diff --git a/file1.ts b/file1.ts
index abc1234..def5678 100644
--- a/file1.ts
+++ b/file1.ts
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };
diff --git a/file2.ts b/file2.ts
index 111222..333444 100644
--- a/file2.ts
+++ b/file2.ts
@@ -1 +1 @@
-const old = true;
+const new = false;
`;

    const files = parseDiff(diffText);

    expect(files).toHaveLength(2);
    expect(files[0].path).toBe("file1.ts");
    expect(files[1].path).toBe("file2.ts");
  });

  it("parses diff lines correctly", () => {
    const diffText = `diff --git a/test.ts b/test.ts
index abc..def 100644
--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,4 @@
 line 1
-line 2 old
+line 2 new
 line 3
 line 4
`;

    const files = parseDiff(diffText);
    const lines = files[0].hunks[0].lines;

    // Empty line at end is counted, so 6 lines total
    expect(lines.length).toBeGreaterThanOrEqual(5);
    expect(lines[0].type).toBe("context");
    expect(lines[1].type).toBe("remove");
    expect(lines[1].content).toBe("line 2 old");
    expect(lines[2].type).toBe("add");
    expect(lines[2].content).toBe("line 2 new");
    expect(lines[3].type).toBe("context");
    expect(lines[4].type).toBe("context");
  });
});
