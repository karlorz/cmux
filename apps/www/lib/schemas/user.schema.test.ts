import { describe, expect, it } from "vitest";
import {
  UserSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UserParamsSchema,
  UserListSchema,
  UserQuerySchema,
} from "./user.schema";

describe("UserSchema", () => {
  it("validates a complete user", () => {
    const valid = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      age: 30,
      createdAt: "2024-01-01T00:00:00Z",
    };

    const result = UserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates user without age", () => {
    const valid = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      createdAt: "2024-01-01T00:00:00Z",
    };

    const result = UserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const invalid = {
      id: "user-123",
      name: "John Doe",
      email: "not-an-email",
      createdAt: "2024-01-01T00:00:00Z",
    };

    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects age over 150", () => {
    const invalid = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      age: 200,
      createdAt: "2024-01-01T00:00:00Z",
    };

    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative age", () => {
    const invalid = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      age: -5,
      createdAt: "2024-01-01T00:00:00Z",
    };

    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid datetime", () => {
    const invalid = {
      id: "user-123",
      name: "John Doe",
      email: "john@example.com",
      createdAt: "not-a-date",
    };

    const result = UserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("CreateUserSchema", () => {
  it("validates a valid create payload", () => {
    const valid = {
      name: "John Doe",
      email: "john@example.com",
      age: 25,
    };

    const result = CreateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates without age", () => {
    const valid = {
      name: "John Doe",
      email: "john@example.com",
    };

    const result = CreateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const invalid = {
      name: "",
      email: "john@example.com",
    };

    const result = CreateUserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    const invalid = {
      name: "a".repeat(101),
      email: "john@example.com",
    };

    const result = CreateUserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UpdateUserSchema", () => {
  it("validates partial update", () => {
    const valid = {
      name: "New Name",
    };

    const result = UpdateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates empty object (no updates)", () => {
    const valid = {};

    const result = UpdateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates all fields", () => {
    const valid = {
      name: "New Name",
      email: "new@example.com",
      age: 35,
    };

    const result = UpdateUserSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const invalid = {
      email: "invalid",
    };

    const result = UpdateUserSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UserParamsSchema", () => {
  it("validates path parameter", () => {
    const valid = {
      id: "user-123",
    };

    const result = UserParamsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const invalid = {
      id: "",
    };

    const result = UserParamsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("UserListSchema", () => {
  it("validates a user list response", () => {
    const valid = {
      users: [
        {
          id: "user-1",
          name: "John",
          email: "john@example.com",
          createdAt: "2024-01-01T00:00:00Z",
        },
      ],
      total: 100,
      page: 1,
      pageSize: 10,
    };

    const result = UserListSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates empty users array", () => {
    const valid = {
      users: [],
      total: 0,
      page: 1,
      pageSize: 10,
    };

    const result = UserListSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

describe("UserQuerySchema", () => {
  it("transforms string page to number", () => {
    const input = {
      page: "2",
      pageSize: "20",
    };

    const result = UserQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it("uses defaults for missing values", () => {
    const input = {};

    const result = UserQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(10);
    }
  });

  it("accepts optional search parameter", () => {
    const input = {
      search: "john",
    };

    const result = UserQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe("john");
    }
  });

  it("rejects non-numeric page", () => {
    const invalid = {
      page: "abc",
    };

    const result = UserQuerySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric pageSize", () => {
    const invalid = {
      pageSize: "xyz",
    };

    const result = UserQuerySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
