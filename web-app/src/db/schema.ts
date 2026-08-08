import {
	boolean,
	date,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// ==========================================
// 1. Better Auth 用の基本テーブル (+ カスタムカラム)
// ==========================================

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("emailVerified").notNull(),
	image: text("image"),
	// --- カスタムカラム ---
	timezone: text("timezone").default("Asia/Tokyo").notNull(),
	// ----------------------
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	token: text("token").notNull().unique(),
	expiresAt: timestamp("expiresAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	ipAddress: text("ipAddress"),
	userAgent: text("userAgent"),
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accountId: text("accountId").notNull(),
	providerId: text("providerId").notNull(),
	accessToken: text("accessToken"),
	refreshToken: text("refreshToken"),
	idToken: text("idToken"),
	accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
		mode: "date",
		withTimezone: true,
	}),
	refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
		mode: "date",
		withTimezone: true,
	}),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expiresAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	createdAt: timestamp("createdAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
	updatedAt: timestamp("updatedAt", {
		mode: "date",
		withTimezone: true,
	}).notNull(),
});

// ==========================================
// 2. アプリ固有のテーブル (Daily Green)
// ==========================================

export const habit = pgTable(
	"habit",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("userId")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		emoji: text("emoji").notNull().default(""),
		currentStreak: integer("currentStreak").notNull().default(0),
		maxStreak: integer("maxStreak").notNull().default(0),
		archivedAt: timestamp("archivedAt", { mode: "date", withTimezone: true }),
		createdAt: timestamp("createdAt", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("habit_user_id_archived_at_id_idx").on(
			table.userId,
			table.archivedAt,
			table.id,
		),
	],
);

export const dailyRecord = pgTable(
	"daily_record",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		habitId: uuid("habitId")
			.notNull()
			.references(() => habit.id, { onDelete: "cascade" }),
		date: date("date", { mode: "string" }).notNull(), // 'YYYY-MM-DD' として扱う
		completedAt: timestamp("completedAt", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
	},
	// 同一日に同じ習慣の記録が重複しないよう、複合ユニーク制約を設定
	(table) => [unique("habit_date_unique").on(table.habitId, table.date)],
);
