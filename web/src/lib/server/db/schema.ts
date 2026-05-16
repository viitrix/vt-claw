import type { InferSelectModel } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("User", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("assistant"),
});

export type AuthUser = InferSelectModel<typeof user>;
export type User = Omit<AuthUser, "password">;

export const session = sqliteTable("Session", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

export type Session = InferSelectModel<typeof session>;

export const chat = sqliteTable("Chat", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  title: text("title").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  visibility: text("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = sqliteTable("Message", {
  id: text("id")
    .primaryKey()
    .notNull()
    .$defaultFn(() => crypto.randomUUID()),
  chatId: text("chatId")
    .notNull()
    .references(() => chat.id),
  role: text("role").notNull(),
  parts: text("parts", { mode: "json" }).notNull(),
  attachments: text("attachments", { mode: "json" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const document = sqliteTable(
  "Document",
  (t) => ({
    id: text("id")
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: text("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: text("userId")
      .notNull()
      .references(() => user.id),
  }),
  (table) => [primaryKey({ columns: [table.id, table.createdAt] })],
);

export type Document = InferSelectModel<typeof document>;
