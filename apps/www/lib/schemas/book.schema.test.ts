import { describe, expect, it } from "vitest";
import {
  BookSchema,
  CreateBookSchema,
  BookParamsSchema,
  BookListSchema,
} from "./book.schema";

describe("BookSchema", () => {
  it("validates a complete book", () => {
    const valid = {
      id: "book-456",
      title: "The Great Gatsby",
      author: "F. Scott Fitzgerald",
      isbn: "978-0-7432-7356-5",
      publishedYear: 1925,
      genre: "fiction",
      available: true,
    };

    const result = BookSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates book without optional isbn", () => {
    const valid = {
      id: "book-123",
      title: "Some Book",
      author: "Some Author",
      publishedYear: 2020,
      genre: "non-fiction",
      available: false,
    };

    const result = BookSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates all genre types", () => {
    const genres = ["fiction", "non-fiction", "science", "history", "biography"] as const;

    for (const genre of genres) {
      const book = {
        id: "book-1",
        title: "Test",
        author: "Author",
        publishedYear: 2000,
        genre,
        available: true,
      };

      const result = BookSchema.safeParse(book);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid genre", () => {
    const invalid = {
      id: "book-1",
      title: "Test",
      author: "Author",
      publishedYear: 2000,
      genre: "mystery", // not in enum
      available: true,
    };

    const result = BookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean available", () => {
    const invalid = {
      id: "book-1",
      title: "Test",
      author: "Author",
      publishedYear: 2000,
      genre: "fiction",
      available: "yes", // should be boolean
    };

    const result = BookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("CreateBookSchema", () => {
  it("validates a valid creation payload", () => {
    const valid = {
      title: "New Book",
      author: "New Author",
      publishedYear: 2023,
      genre: "science",
    };

    const result = CreateBookSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates with optional isbn", () => {
    const valid = {
      title: "New Book",
      author: "New Author",
      isbn: "978-1-234-56789-0",
      publishedYear: 2023,
      genre: "history",
    };

    const result = CreateBookSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const invalid = {
      title: "",
      author: "Author",
      publishedYear: 2020,
      genre: "fiction",
    };

    const result = CreateBookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects title over 200 characters", () => {
    const invalid = {
      title: "a".repeat(201),
      author: "Author",
      publishedYear: 2020,
      genre: "fiction",
    };

    const result = CreateBookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects publishedYear before 1000", () => {
    const invalid = {
      title: "Ancient Book",
      author: "Unknown",
      publishedYear: 999,
      genre: "history",
    };

    const result = CreateBookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects publishedYear in the future", () => {
    const futureYear = new Date().getFullYear() + 1;
    const invalid = {
      title: "Future Book",
      author: "Time Traveler",
      publishedYear: futureYear,
      genre: "fiction",
    };

    const result = CreateBookSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("BookParamsSchema", () => {
  it("validates path parameter", () => {
    const valid = { id: "book-456" };

    const result = BookParamsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects empty id", () => {
    const invalid = { id: "" };

    const result = BookParamsSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe("BookListSchema", () => {
  it("validates a book list response", () => {
    const valid = {
      books: [
        {
          id: "book-1",
          title: "Book One",
          author: "Author One",
          publishedYear: 2020,
          genre: "fiction",
          available: true,
        },
      ],
      total: 1,
    };

    const result = BookListSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("validates empty books array", () => {
    const valid = {
      books: [],
      total: 0,
    };

    const result = BookListSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects missing total", () => {
    const invalid = {
      books: [],
    };

    const result = BookListSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
