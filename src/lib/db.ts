import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

export type UserRole = "admin" | "user";
export type AdminScopeValue = "admin" | "operator";

export type User = {
  id: number;
  username: string;
  role: UserRole;
  items: Array<{
    itemTypeId: number;
    itemName: string;
    quantity: number;
  }>;
  qrToken: string;
  createdAt: string;
  updatedAt: string;
};

export type ItemType = {
  id: number;
  name: string;
  slug: string;
  dailyScanLimit: number | null;
  imageUrl: string | null;
};

export type ScanMode = {
  id: number;
  name: string;
  startTime: string | null;
  endTime: string | null;
  items: Array<{
    itemTypeId: number;
    itemName: string;
    operation: "add" | "remove";
    quantity: number;
  }>;
};

type DbUser = {
  id: number;
  username: string;
  password_hash: string;
  role: UserRole;
  admin_scope: "admin" | "operator" | null;
  meal_tickets: number;
  dinner_tickets: number;
  qr_token: string;
  created_at: string;
  updated_at: string;
};

type DbAuditLog = {
  id: number;
  actor_email: string;
  target_email: string;
  action: string;
  details: string;
  created_at: string;
};

type DbAuditLogDetailsRow = {
  details: string;
  created_at: string;
};

type DbItemType = {
  id: number;
  name: string;
  slug: string;
  daily_scan_limit: number | null;
  image_url: string | null;
};

type DbUserItem = {
  item_type_id: number;
  item_name: string;
  quantity: number;
};

type DbScanMode = {
  id: number;
  name: string;
  start_time: string | null;
  end_time: string | null;
};

type DbScanModeItem = {
  mode_id: number;
  item_type_id: number;
  item_name: string;
  operation: "add" | "remove";
  quantity: number;
};

export type AdminStaffMember = {
  id: number;
  username: string;
  scope: AdminScopeValue;
};

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function ensureItemTypeSlugAvailable(slug: string, keepId: number | null) {
  const conflict = db
    .prepare("SELECT id, name FROM item_types WHERE slug = ? AND (? IS NULL OR id != ?) LIMIT 1")
    .get(slug, keepId, keepId) as { id: number; name: string } | undefined;

  if (!conflict) {
    return;
  }

  const conflictSlugBase = `${slug}-legacy-${conflict.id}`;
  let nextSlug = conflictSlugBase;
  let suffix = 1;

  while (
    db.prepare("SELECT id FROM item_types WHERE slug = ? AND id != ? LIMIT 1").get(nextSlug, conflict.id) as
      | { id: number }
      | undefined
  ) {
    suffix += 1;
    nextSlug = `${conflictSlugBase}-${suffix}`;
  }

  db.prepare("UPDATE item_types SET slug = ? WHERE id = ?").run(nextSlug, conflict.id);
}

function ensureDefaultGenericItemTypes() {
  const defaults = [
    { name: "componente1", slug: "componente1" },
    { name: "componente2", slug: "componente2" },
  ] as const;

  for (const [index, item] of defaults.entries()) {
    const row = db
      .prepare(
        `SELECT id
         FROM item_types
         WHERE is_active = 1
         ORDER BY id ASC
         LIMIT 1 OFFSET ?`
      )
      .get(index) as { id: number } | undefined;

    if (row) {
      ensureItemTypeSlugAvailable(item.slug, row.id);
      db.prepare("UPDATE item_types SET name = ?, slug = ? WHERE id = ?").run(item.name, item.slug, row.id);
      continue;
    }

    ensureItemTypeSlugAvailable(item.slug, null);
    db.prepare("INSERT INTO item_types (name, slug) VALUES (?, ?)").run(item.name, item.slug);
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  admin_scope TEXT,
  meal_tickets INTEGER NOT NULL DEFAULT 0,
  dinner_tickets INTEGER NOT NULL DEFAULT 0,
  clothing_item TEXT NOT NULL DEFAULT '',
  accessory_item TEXT NOT NULL DEFAULT '',
  clothing_status TEXT NOT NULL DEFAULT 'NONE' CHECK (clothing_status IN ('NONE', 'PURCHASED', 'DELIVERED', 'SIZE_CHANGED')),
  qr_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  image_url TEXT,
  daily_scan_limit INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_item_balances (
  user_id INTEGER NOT NULL,
  item_type_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS scan_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_time TEXT,
  end_time TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_mode_items (
  mode_id INTEGER NOT NULL,
  item_type_id INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('add', 'remove')),
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (mode_id, item_type_id)
);

CREATE TABLE IF NOT EXISTS scan_daily_usage (
  user_id INTEGER NOT NULL,
  item_type_id INTEGER NOT NULL,
  usage_date TEXT NOT NULL,
  used_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_type_id, usage_date)
);

CREATE TABLE IF NOT EXISTS scan_undo_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL,
  mode_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_setup_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  actor_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const itemTypeColumns = db.prepare("PRAGMA table_info(item_types)").all() as Array<{ name: string }>;
if (!itemTypeColumns.some((column) => column.name === "daily_scan_limit")) {
  db.prepare("ALTER TABLE item_types ADD COLUMN daily_scan_limit INTEGER").run();
}
if (!itemTypeColumns.some((column) => column.name === "image_url")) {
  db.prepare("ALTER TABLE item_types ADD COLUMN image_url TEXT").run();
}

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((column) => column.name === "admin_scope")) {
  db.prepare("ALTER TABLE users ADD COLUMN admin_scope TEXT").run();
}

db.prepare("UPDATE users SET admin_scope = 'admin' WHERE role = 'admin' AND (admin_scope IS NULL OR admin_scope = '')").run();
db.prepare("UPDATE users SET admin_scope = 'operator' WHERE role = 'admin' AND admin_scope = 'supervisor'").run();

const scanModeColumns = db.prepare("PRAGMA table_info(scan_modes)").all() as Array<{ name: string }>;
if (!scanModeColumns.some((column) => column.name === "start_time")) {
  db.prepare("ALTER TABLE scan_modes ADD COLUMN start_time TEXT").run();
}
if (!scanModeColumns.some((column) => column.name === "end_time")) {
  db.prepare("ALTER TABLE scan_modes ADD COLUMN end_time TEXT").run();
}

db.prepare(
  `DELETE FROM user_item_balances
   WHERE user_id NOT IN (SELECT id FROM users)
      OR item_type_id NOT IN (SELECT id FROM item_types)`
).run();

db.prepare(
  `DELETE FROM scan_mode_items
   WHERE mode_id NOT IN (SELECT id FROM scan_modes)
      OR item_type_id NOT IN (SELECT id FROM item_types)`
).run();

db.prepare(
  `DELETE FROM scan_daily_usage
   WHERE user_id NOT IN (SELECT id FROM users)
      OR item_type_id NOT IN (SELECT id FROM item_types)`
).run();

ensureDefaultGenericItemTypes();

// Ensure every user has balances for all item types and migrate legacy fields once.
const users = db.prepare("SELECT id, meal_tickets, dinner_tickets FROM users").all() as Array<{
  id: number;
  meal_tickets: number;
  dinner_tickets: number;
}>;

const types = db.prepare("SELECT id, slug FROM item_types WHERE is_active = 1 ORDER BY id ASC").all() as Array<{
  id: number;
  slug: string;
}>;

for (const user of users) {
  for (const [index, type] of types.entries()) {
    const existing = db
      .prepare("SELECT quantity FROM user_item_balances WHERE user_id = ? AND item_type_id = ? LIMIT 1")
      .get(user.id, type.id) as { quantity: number } | undefined;

    if (existing) {
      continue;
    }

    const qty = index === 0 ? user.meal_tickets : index === 1 ? user.dinner_tickets : 0;
    db.prepare(
      "INSERT INTO user_item_balances (user_id, item_type_id, quantity) VALUES (?, ?, ?)"
    ).run(user.id, type.id, qty);
  }
}

const createAdminUsername = normalizeEmail(process.env.ADMIN_USERNAME ?? "admin@example.local");
const createAdminPassword = process.env.ADMIN_PASSWORD ?? "replace_with_strong_password";

const adminExists = db
  .prepare("SELECT id, username, password_hash FROM users WHERE role = 'admin' LIMIT 1")
  .get() as { id: number; username: string; password_hash: string } | undefined;

if (!adminExists) {
  const existingUsername = db
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(createAdminUsername) as { id: number } | undefined;

  if (existingUsername) {
    db.prepare("UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      existingUsername.id,
    );
    db.prepare("UPDATE users SET admin_scope = 'admin' WHERE id = ?").run(existingUsername.id);
  } else {
    const passwordHash = bcrypt.hashSync(createAdminPassword, 12);
    const qrToken = randomBytes(24).toString("hex");

    db.prepare(
      `INSERT INTO users (
        username,
        password_hash,
        role,
        admin_scope,
        meal_tickets,
        dinner_tickets,
        clothing_item,
        accessory_item,
        clothing_status,
        qr_token
      ) VALUES (?, ?, 'admin', 'admin', 0, 0, '', '', 'NONE', ?)`
    ).run(createAdminUsername, passwordHash, qrToken);
  }
} else if (adminExists.username !== createAdminUsername) {
  const usernameTaken = db
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(createAdminUsername) as { id: number } | undefined;

  if (!usernameTaken) {
    db.prepare("UPDATE users SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
      createAdminUsername,
      adminExists.id,
    );
  }
}

if (adminExists && !bcrypt.compareSync(createAdminPassword, adminExists.password_hash)) {
  const passwordHash = bcrypt.hashSync(createAdminPassword, 12);

  db.prepare("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    passwordHash,
    adminExists.id,
  );
}

db.prepare("UPDATE users SET admin_scope = 'admin' WHERE role = 'admin' AND (admin_scope IS NULL OR admin_scope = '')").run();

function mapUser(user: DbUser): User {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    items: getUserItems(user.id),
    qrToken: user.qr_token,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function mapItemType(row: DbItemType): ItemType {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.image_url ?? null,
    dailyScanLimit:
      typeof row.daily_scan_limit === "number" && row.daily_scan_limit > 0
        ? row.daily_scan_limit
        : null,
  };
}

function getUserItems(userId: number) {
  const rows = db
    .prepare(
      `SELECT
         t.id AS item_type_id,
         t.name AS item_name,
         COALESCE(b.quantity, 0) AS quantity
       FROM item_types AS t
       LEFT JOIN user_item_balances AS b
         ON b.item_type_id = t.id AND b.user_id = ?
       WHERE t.is_active = 1
       ORDER BY t.id ASC`
    )
    .all(userId) as DbUserItem[];

  return rows.map((row) => ({
    itemTypeId: row.item_type_id,
    itemName: row.item_name,
    quantity: row.quantity,
  }));
}

function mapActivity(row: DbAuditLog) {
  return {
    id: row.id,
    actorEmail: row.actor_email,
    targetEmail: row.target_email,
    action: row.action,
    details: row.details,
    createdAt: row.created_at,
  };
}

export function getUserByUsername(username: string) {
  const normalizedUsername = normalizeEmail(username);

  const user = db
    .prepare("SELECT * FROM users WHERE username = ? LIMIT 1")
    .get(normalizedUsername) as DbUser | undefined;

  return user;
}

export function getUserById(id: number) {
  const user = db
    .prepare("SELECT * FROM users WHERE id = ? LIMIT 1")
    .get(id) as DbUser | undefined;

  return user ? mapUser(user) : null;
}

export function getUserByQrToken(token: string) {
  const user = db
    .prepare("SELECT * FROM users WHERE qr_token = ? LIMIT 1")
    .get(token) as DbUser | undefined;

  return user ? mapUser(user) : null;
}

export function listManagedUsers() {
  const users = db
    .prepare("SELECT * FROM users WHERE role = 'user' ORDER BY username COLLATE NOCASE ASC")
    .all() as DbUser[];

  return users.map(mapUser);
}

export function getAdminSummary() {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS totalUsers,
         COALESCE((
           SELECT SUM(b.quantity)
           FROM user_item_balances AS b
           INNER JOIN users AS u ON u.id = b.user_id
           WHERE u.role = 'user'
         ), 0) AS totalUnits
       FROM users
       WHERE role = 'user'`
    )
    .get() as {
      totalUsers: number;
      totalUnits: number;
    };

  return row;
}

export function listAdminStaff() {
  const rows = db
    .prepare(
      `SELECT id, username, admin_scope
       FROM users
       WHERE role = 'admin'
       ORDER BY username COLLATE NOCASE ASC`
    )
    .all() as Array<{ id: number; username: string; admin_scope: string | null }>;

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    scope: row.admin_scope === "operator" ? row.admin_scope : "admin",
  })) as AdminStaffMember[];
}

export function updateAdminScopeFromAdmin(input: {
  actorId: number;
  targetAdminId: number;
  scope: AdminScopeValue;
}) {
  const actor = db
    .prepare("SELECT id, role FROM users WHERE id = ? LIMIT 1")
    .get(input.actorId) as { id: number; role: UserRole } | undefined;

  if (!actor || actor.role !== "admin") {
    return { ok: false as const, reason: "actor_not_admin" as const };
  }

  if (input.actorId === input.targetAdminId) {
    return { ok: false as const, reason: "cannot_change_self" as const };
  }

  const target = db
    .prepare("SELECT id, username, role, admin_scope FROM users WHERE id = ? LIMIT 1")
    .get(input.targetAdminId) as
    | { id: number; username: string; role: UserRole; admin_scope: string | null }
    | undefined;

  if (!target || target.role !== "admin") {
    return { ok: false as const, reason: "target_not_admin" as const };
  }

  const previousScope: AdminScopeValue = target.admin_scope === "operator" ? target.admin_scope : "admin";

  db.prepare("UPDATE users SET admin_scope = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    input.scope,
    input.targetAdminId,
  );

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(
    input.actorId,
    input.targetAdminId,
    "ADMIN_SCOPE_UPDATE",
    JSON.stringify({
      previousScope,
      nextScope: input.scope,
      targetAdminId: input.targetAdminId,
    }),
  );

  const updated = listAdminStaff().find((staff) => staff.id === input.targetAdminId) ?? null;
  return { ok: true as const, member: updated };
}

export function deleteAdminStaffFromAdmin(input: {
  actorId: number;
  targetAdminId: number;
}) {
  const actor = db
    .prepare("SELECT id, role FROM users WHERE id = ? LIMIT 1")
    .get(input.actorId) as { id: number; role: UserRole } | undefined;

  if (!actor || actor.role !== "admin") {
    return { ok: false as const, reason: "actor_not_admin" as const };
  }

  if (input.actorId === input.targetAdminId) {
    return { ok: false as const, reason: "cannot_delete_self" as const };
  }

  const target = db
    .prepare("SELECT id, username, role FROM users WHERE id = ? LIMIT 1")
    .get(input.targetAdminId) as { id: number; username: string; role: UserRole } | undefined;

  if (!target || target.role !== "admin") {
    return { ok: false as const, reason: "target_not_admin" as const };
  }

  const adminCount = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'")
    .get() as { count: number };

  if (adminCount.count <= 1) {
    return { ok: false as const, reason: "cannot_delete_last_admin" as const };
  }

  db.prepare("DELETE FROM user_item_balances WHERE user_id = ?").run(input.targetAdminId);
  db.prepare("DELETE FROM scan_daily_usage WHERE user_id = ?").run(input.targetAdminId);
  db.prepare("DELETE FROM scan_undo_actions WHERE actor_id = ? OR target_user_id = ?").run(
    input.targetAdminId,
    input.targetAdminId,
  );
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(input.targetAdminId);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(
    input.actorId,
    input.targetAdminId,
    "ADMIN_STAFF_DELETE",
    JSON.stringify({
      targetUsername: target.username,
      remainingAdmins: Math.max(0, adminCount.count - 1),
    }),
  );

  return { ok: true as const };
}

export function listItemTypes() {
  const rows = db
    .prepare("SELECT id, name, slug, image_url, daily_scan_limit FROM item_types WHERE is_active = 1 ORDER BY id ASC")
    .all() as DbItemType[];

  return rows.map(mapItemType);
}

export function resetManagedDataFromAdmin() {
  const transaction = db.transaction(() => {
    const managedUserIds = db
      .prepare("SELECT id FROM users WHERE role = 'user'")
      .all() as Array<{ id: number }>;

    const managedUserCount = managedUserIds.length;
    const deletedBalanceCount = db
      .prepare("DELETE FROM user_item_balances WHERE user_id IN (SELECT id FROM users WHERE role = 'user')")
      .run().changes;
    db.prepare("DELETE FROM scan_daily_usage WHERE user_id IN (SELECT id FROM users WHERE role = 'user')").run();
    const deletedUserCount = db.prepare("DELETE FROM users WHERE role = 'user'").run().changes;
    const deletedModeItemCount = db.prepare("DELETE FROM scan_mode_items").run().changes;
    const deletedModeCount = db.prepare("DELETE FROM scan_modes").run().changes;
    const deletedLogCount = db.prepare("DELETE FROM audit_logs").run().changes;

    return {
      deletedUserCount,
      deletedBalanceCount,
      deletedModeCount,
      deletedModeItemCount,
      deletedLogCount,
      previousManagedUserCount: managedUserCount,
      remainingItemTypes: listItemTypes().length,
    };
  });

  return transaction();
}

function makeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function listScanModes() {
  const modes = db
    .prepare("SELECT id, name, start_time, end_time FROM scan_modes WHERE is_active = 1 ORDER BY id ASC")
    .all() as DbScanMode[];

  const items = db
    .prepare(
      `SELECT
         i.mode_id,
         i.item_type_id,
         t.name AS item_name,
         i.operation,
         i.quantity
       FROM scan_mode_items AS i
       INNER JOIN scan_modes AS m ON m.id = i.mode_id
       INNER JOIN item_types AS t ON t.id = i.item_type_id
       WHERE m.is_active = 1 AND t.is_active = 1
       ORDER BY i.mode_id ASC, i.item_type_id ASC`
    )
    .all() as DbScanModeItem[];

  return modes.map((mode) => ({
    id: mode.id,
    name: mode.name,
    startTime: mode.start_time,
    endTime: mode.end_time,
    items: items
      .filter((item) => item.mode_id === mode.id)
      .map((item) => ({
        itemTypeId: item.item_type_id,
        itemName: item.item_name,
        operation: item.operation,
        quantity: item.quantity,
      })),
  }));
}

export function createScanModeFromAdmin(input: {
  actorId: number;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  items: Array<{ itemTypeId: number; operation: "add" | "remove"; quantity: number }>;
}) {
  const nextName = input.name.trim();
  if (!nextName || input.items.length === 0) {
    return null;
  }

  const normalizedStart = input.startTime ?? null;
  const normalizedEnd = input.endTime ?? null;

  const modeResult = db
    .prepare("INSERT INTO scan_modes (name, start_time, end_time) VALUES (?, ?, ?)")
    .run(nextName, normalizedStart, normalizedEnd);
  const modeId = Number(modeResult.lastInsertRowid);

  for (const item of input.items) {
    db.prepare(
      `INSERT INTO scan_mode_items (mode_id, item_type_id, operation, quantity)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(mode_id, item_type_id)
       DO UPDATE SET operation = excluded.operation, quantity = excluded.quantity`
    ).run(modeId, item.itemTypeId, item.operation, Math.max(0, item.quantity));
  }

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "SCAN_MODE_CREATE",
    JSON.stringify({ modeId, name: nextName, startTime: normalizedStart, endTime: normalizedEnd, items: input.items }),
  );

  return listScanModes().find((mode) => mode.id === modeId) ?? null;
}

export function updateScanModeFromAdmin(input: {
  actorId: number;
  modeId: number;
  name: string;
  startTime?: string | null;
  endTime?: string | null;
  items: Array<{ itemTypeId: number; operation: "add" | "remove"; quantity: number }>;
}) {
  const nextName = input.name.trim();
  if (!nextName || input.items.length === 0) {
    return null;
  }

  const existing = db
    .prepare("SELECT id, name FROM scan_modes WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.modeId) as { id: number; name: string } | undefined;

  if (!existing) {
    return null;
  }

  try {
    db.prepare(
      "UPDATE scan_modes SET name = ?, start_time = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1"
    ).run(nextName, input.startTime ?? null, input.endTime ?? null, input.modeId);
  } catch {
    return null;
  }

  db.prepare("DELETE FROM scan_mode_items WHERE mode_id = ?").run(input.modeId);

  for (const item of input.items) {
    db.prepare(
      `INSERT INTO scan_mode_items (mode_id, item_type_id, operation, quantity)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(mode_id, item_type_id)
       DO UPDATE SET operation = excluded.operation, quantity = excluded.quantity`
    ).run(input.modeId, item.itemTypeId, item.operation, Math.max(0, item.quantity));
  }

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "SCAN_MODE_UPDATE",
    JSON.stringify({
      modeId: input.modeId,
      previousName: existing.name,
      nextName,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      items: input.items,
    }),
  );

  return listScanModes().find((mode) => mode.id === input.modeId) ?? null;
}

export function applyScanModeByQrToken(input: {
  actorId: number;
  token: string;
  modeId: number;
}) {
  const user = db
    .prepare("SELECT * FROM users WHERE qr_token = ? AND role = 'user' LIMIT 1")
    .get(input.token) as DbUser | undefined;

  if (!user) {
    return null;
  }

  const mode = listScanModes().find((row) => row.id === input.modeId);
  if (!mode || mode.items.length === 0) {
    return null;
  }

  const now = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (mode.startTime && mode.endTime) {
    const inRange = mode.startTime <= mode.endTime
      ? nowTime >= mode.startTime && nowTime <= mode.endTime
      : nowTime >= mode.startTime || nowTime <= mode.endTime;

    if (!inRange) {
      return {
        ok: false as const,
        reason: "outside_schedule" as const,
        startTime: mode.startTime,
        endTime: mode.endTime,
      };
    }
  }

  const transaction = db.transaction(() => {
    const dailyLimits = db
      .prepare("SELECT id, daily_scan_limit FROM item_types WHERE is_active = 1")
      .all() as Array<{ id: number; daily_scan_limit: number | null }>;
    const dailyLimitByTypeId = new Map<number, number | null>();

    for (const row of dailyLimits) {
      dailyLimitByTypeId.set(
        row.id,
        typeof row.daily_scan_limit === "number" && row.daily_scan_limit > 0 ? row.daily_scan_limit : null,
      );
    }

    for (const entry of mode.items) {
      if (entry.operation !== "remove" || entry.quantity <= 0) {
        continue;
      }

      const dailyLimit = dailyLimitByTypeId.get(entry.itemTypeId) ?? null;
      if (!dailyLimit) {
        continue;
      }

      const usage = db
        .prepare(
          `SELECT used_quantity
           FROM scan_daily_usage
           WHERE user_id = ? AND item_type_id = ? AND usage_date = date('now', 'localtime')
           LIMIT 1`
        )
        .get(user.id, entry.itemTypeId) as { used_quantity: number } | undefined;

      const currentUsed = usage?.used_quantity ?? 0;
      if (currentUsed + entry.quantity > dailyLimit) {
        return {
          ok: false as const,
          reason: "daily_limit_exceeded" as const,
          itemName: entry.itemName,
          dailyLimit,
          currentUsed,
          attempted: entry.quantity,
        };
      }
    }

    const undoItems: Array<{
      itemTypeId: number;
      itemName: string;
      operation: "add" | "remove";
      appliedQuantity: number;
      beforeQuantity: number;
      afterQuantity: number;
    }> = [];

    for (const entry of mode.items) {
      const current = db
        .prepare("SELECT quantity FROM user_item_balances WHERE user_id = ? AND item_type_id = ? LIMIT 1")
        .get(user.id, entry.itemTypeId) as { quantity: number } | undefined;

      const base = current?.quantity ?? 0;
      const nextQty = entry.operation === "remove"
        ? Math.max(0, base - entry.quantity)
        : Math.max(0, base + entry.quantity);

      db.prepare(
        `INSERT INTO user_item_balances (user_id, item_type_id, quantity)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, item_type_id)
         DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`
      ).run(user.id, entry.itemTypeId, nextQty);

      if (entry.operation === "remove" && entry.quantity > 0) {
        db.prepare(
          `INSERT INTO scan_daily_usage (user_id, item_type_id, usage_date, used_quantity)
           VALUES (?, ?, date('now', 'localtime'), ?)
           ON CONFLICT(user_id, item_type_id, usage_date)
           DO UPDATE SET used_quantity = scan_daily_usage.used_quantity + excluded.used_quantity,
                         updated_at = CURRENT_TIMESTAMP`
        ).run(user.id, entry.itemTypeId, entry.quantity);
      }

      undoItems.push({
        itemTypeId: entry.itemTypeId,
        itemName: entry.itemName,
        operation: entry.operation,
        appliedQuantity: entry.quantity,
        beforeQuantity: base,
        afterQuantity: nextQty,
      });
    }

    db.prepare("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

    db.prepare(
      "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
    ).run(
      input.actorId,
      user.id,
      "SCAN_MODE_APPLY",
      JSON.stringify({ modeId: mode.id, modeName: mode.name, items: mode.items }),
    );

    db.prepare("DELETE FROM scan_undo_actions WHERE actor_id = ? AND used_at IS NULL").run(input.actorId);

    const undoPayload = JSON.stringify({
      modeId: mode.id,
      modeName: mode.name,
      items: undoItems,
    });

    const undoResult = db.prepare(
      `INSERT INTO scan_undo_actions (actor_id, target_user_id, mode_id, payload, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+20 seconds'))`
    ).run(input.actorId, user.id, mode.id, undoPayload);

    const undoAction = db
      .prepare("SELECT expires_at FROM scan_undo_actions WHERE id = ? LIMIT 1")
      .get(Number(undoResult.lastInsertRowid)) as { expires_at: string } | undefined;

    return {
      ok: true as const,
      mode,
      user: getUserById(user.id),
      undoAvailableUntil: undoAction?.expires_at ?? null,
    };
  });

  return transaction();
}

export function undoLastScanModeApply(input: { actorId: number }) {
  const transaction = db.transaction(({ actorId }: { actorId: number }) => {
    const undoAction = db
      .prepare(
        `SELECT id, target_user_id, mode_id, payload, expires_at
         FROM scan_undo_actions
         WHERE actor_id = ?
           AND used_at IS NULL
           AND expires_at >= CURRENT_TIMESTAMP
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(actorId) as
      | {
          id: number;
          target_user_id: number;
          mode_id: number;
          payload: string;
          expires_at: string;
        }
      | undefined;

    if (!undoAction) {
      return { ok: false as const, reason: "not_found_or_expired" as const };
    }

    const target = db
      .prepare("SELECT id FROM users WHERE id = ? AND role = 'user' LIMIT 1")
      .get(undoAction.target_user_id) as { id: number } | undefined;

    if (!target) {
      db.prepare("UPDATE scan_undo_actions SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(
        undoAction.id,
      );
      return { ok: false as const, reason: "target_not_found" as const };
    }

    const parsed = JSON.parse(undoAction.payload) as {
      modeId: number;
      modeName: string;
      items: Array<{
        itemTypeId: number;
        itemName: string;
        operation?: "add" | "remove";
        appliedQuantity?: number;
        beforeQuantity: number;
        afterQuantity: number;
      }>;
    };

    for (const entry of parsed.items ?? []) {
      db.prepare(
        `INSERT INTO user_item_balances (user_id, item_type_id, quantity)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, item_type_id)
         DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`
      ).run(undoAction.target_user_id, entry.itemTypeId, Math.max(0, entry.beforeQuantity));

      if (entry.operation === "remove" && (entry.appliedQuantity ?? 0) > 0) {
        const usage = db
          .prepare(
            `SELECT used_quantity
             FROM scan_daily_usage
             WHERE user_id = ? AND item_type_id = ? AND usage_date = date('now', 'localtime')
             LIMIT 1`
          )
          .get(undoAction.target_user_id, entry.itemTypeId) as { used_quantity: number } | undefined;

        const nextUsed = Math.max(0, (usage?.used_quantity ?? 0) - (entry.appliedQuantity ?? 0));

        db.prepare(
          `INSERT INTO scan_daily_usage (user_id, item_type_id, usage_date, used_quantity)
           VALUES (?, ?, date('now', 'localtime'), ?)
           ON CONFLICT(user_id, item_type_id, usage_date)
           DO UPDATE SET used_quantity = excluded.used_quantity,
                         updated_at = CURRENT_TIMESTAMP`
        ).run(undoAction.target_user_id, entry.itemTypeId, nextUsed);
      }
    }

    db.prepare("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(undoAction.target_user_id);
    db.prepare("UPDATE scan_undo_actions SET used_at = CURRENT_TIMESTAMP WHERE id = ? AND used_at IS NULL").run(
      undoAction.id,
    );

    db.prepare(
      "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
    ).run(
      actorId,
      undoAction.target_user_id,
      "SCAN_MODE_UNDO",
      JSON.stringify({
        undoActionId: undoAction.id,
        modeId: parsed.modeId,
        modeName: parsed.modeName,
        items: parsed.items,
      }),
    );

    return {
      ok: true as const,
      user: getUserById(undoAction.target_user_id),
    };
  });

  return transaction(input);
}

export function updateItemTypeDailyLimitFromAdmin(input: {
  actorId: number;
  itemTypeId: number;
  dailyScanLimit: number | null;
}) {
  const existing = db
    .prepare("SELECT id, name, daily_scan_limit FROM item_types WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.itemTypeId) as { id: number; name: string; daily_scan_limit: number | null } | undefined;

  if (!existing) {
    return null;
  }

  const normalizedLimit = typeof input.dailyScanLimit === "number" && input.dailyScanLimit > 0
    ? Math.min(1000, Math.max(1, Math.floor(input.dailyScanLimit)))
    : null;

  db.prepare(
    `UPDATE item_types
     SET daily_scan_limit = ?
     WHERE id = ? AND is_active = 1`
  ).run(normalizedLimit, input.itemTypeId);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "ITEM_TYPE_DAILY_LIMIT_UPDATE",
    JSON.stringify({
      itemTypeId: input.itemTypeId,
      name: existing.name,
      previousDailyScanLimit:
        typeof existing.daily_scan_limit === "number" && existing.daily_scan_limit > 0
          ? existing.daily_scan_limit
          : null,
      nextDailyScanLimit: normalizedLimit,
    }),
  );

  return listItemTypes().find((item) => item.id === input.itemTypeId) ?? null;
}

export function getLatestScanUndoForActor(input: { actorId: number }) {
  db.prepare(
    `DELETE FROM scan_undo_actions
     WHERE used_at IS NULL
       AND expires_at < CURRENT_TIMESTAMP`
  ).run();

  const undoAction = db
    .prepare(
      `SELECT id, target_user_id, expires_at
       FROM scan_undo_actions
       WHERE actor_id = ?
         AND used_at IS NULL
         AND expires_at >= CURRENT_TIMESTAMP
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(input.actorId) as
    | {
        id: number;
        target_user_id: number;
        expires_at: string;
      }
    | undefined;

  if (!undoAction) {
    return null;
  }

  return {
    undoActionId: undoAction.id,
    targetUserId: undoAction.target_user_id,
    expiresAt: undoAction.expires_at,
  };
}

export function getUserDailyUsageForTodayByAdmin(input: { userId: number }) {
  const targetUser = db
    .prepare("SELECT id FROM users WHERE id = ? AND role = 'user' LIMIT 1")
    .get(input.userId) as { id: number } | undefined;

  if (!targetUser) {
    return null;
  }

  const rows = db
    .prepare(
      `SELECT
         t.id AS item_type_id,
         COALESCE(u.used_quantity, 0) AS used_quantity
       FROM item_types AS t
       LEFT JOIN scan_daily_usage AS u
         ON u.item_type_id = t.id
        AND u.user_id = ?
        AND u.usage_date = date('now', 'localtime')
       WHERE t.is_active = 1
       ORDER BY t.id ASC`
    )
    .all(input.userId) as Array<{ item_type_id: number; used_quantity: number }>;

  return rows.map((row) => ({
    itemTypeId: row.item_type_id,
    usedQuantity: Math.max(0, row.used_quantity),
  }));
}

export function createItemTypeFromAdmin(input: {
  actorId: number;
  name: string;
  initialQuantity: number;
  imageUrl?: string | null;
}) {
  const nextName = input.name.trim();
  const nextImageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const normalizedImageUrl = nextImageUrl ? nextImageUrl.slice(0, 2048) : null;
  if (!nextName) {
    return null;
  }

  const existingByName = db
    .prepare("SELECT id, name, slug, is_active FROM item_types WHERE name = ? COLLATE NOCASE LIMIT 1")
    .get(nextName) as { id: number; name: string; slug: string; is_active: number } | undefined;

  if (existingByName?.is_active === 1) {
    return null;
  }

  if (existingByName?.is_active === 0) {
    db.prepare("UPDATE item_types SET is_active = 1, name = ?, image_url = ? WHERE id = ?").run(nextName, normalizedImageUrl, existingByName.id);

    const userRows = db.prepare("SELECT id FROM users WHERE role = 'user'").all() as Array<{ id: number }>;
    for (const user of userRows) {
      const found = db
        .prepare("SELECT quantity FROM user_item_balances WHERE user_id = ? AND item_type_id = ? LIMIT 1")
        .get(user.id, existingByName.id) as { quantity: number } | undefined;

      if (!found) {
        db.prepare(
          "INSERT INTO user_item_balances (user_id, item_type_id, quantity) VALUES (?, ?, ?)"
        ).run(user.id, existingByName.id, Math.max(0, input.initialQuantity));
      }
    }

    db.prepare(
      "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
    ).run(
      input.actorId,
      "ITEM_TYPE_REACTIVATE",
      JSON.stringify({ itemTypeId: existingByName.id, name: nextName, initialQuantity: input.initialQuantity, imageUrl: normalizedImageUrl }),
    );

    return listItemTypes().find((item) => item.id === existingByName.id) ?? null;
  }

  const slugBase = makeSlug(nextName) || "dato";
  let slug = slugBase;
  let suffix = 1;

  while (
    db.prepare("SELECT id FROM item_types WHERE slug = ? LIMIT 1").get(slug) as
      | { id: number }
      | undefined
  ) {
    suffix += 1;
    slug = `${slugBase}-${suffix}`;
  }

  const result = db
    .prepare("INSERT INTO item_types (name, slug, image_url) VALUES (?, ?, ?)")
    .run(nextName, slug, normalizedImageUrl);

  const itemTypeId = Number(result.lastInsertRowid);

  const userRows = db.prepare("SELECT id FROM users WHERE role = 'user'").all() as Array<{ id: number }>;
  for (const user of userRows) {
    db.prepare(
      "INSERT INTO user_item_balances (user_id, item_type_id, quantity) VALUES (?, ?, ?)"
    ).run(user.id, itemTypeId, Math.max(0, input.initialQuantity));
  }

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(input.actorId, "ITEM_TYPE_CREATE", JSON.stringify({ itemTypeId, name: nextName, initialQuantity: input.initialQuantity, imageUrl: normalizedImageUrl }));

  return listItemTypes().find((item) => item.id === itemTypeId) ?? null;
}

export function renameItemTypeFromAdmin(input: {
  actorId: number;
  itemTypeId: number;
  name: string;
  imageUrl?: string | null;
}) {
  const nextName = input.name.trim();
  const nextImageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const normalizedImageUrl = nextImageUrl ? nextImageUrl.slice(0, 2048) : null;
  if (!nextName) {
    return null;
  }

  const existing = db
    .prepare("SELECT id, name, image_url FROM item_types WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.itemTypeId) as { id: number; name: string; image_url: string | null } | undefined;

  if (!existing) {
    return null;
  }

  let slugBase = makeSlug(nextName);
  if (!slugBase) {
    slugBase = "dato";
  }

  let slug = slugBase;
  let suffix = 1;

  while (
    db.prepare("SELECT id FROM item_types WHERE slug = ? AND id != ? LIMIT 1").get(slug, input.itemTypeId) as
      | { id: number }
      | undefined
  ) {
    suffix += 1;
    slug = `${slugBase}-${suffix}`;
  }

  try {
    db.prepare(
      `UPDATE item_types
       SET name = ?,
           slug = ?,
           image_url = ?
       WHERE id = ? AND is_active = 1`
    ).run(nextName, slug, normalizedImageUrl, input.itemTypeId);
  } catch {
    return null;
  }

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "ITEM_TYPE_RENAME",
    JSON.stringify({ itemTypeId: input.itemTypeId, previousName: existing.name, nextName, previousImageUrl: existing.image_url ?? null, nextImageUrl: normalizedImageUrl }),
  );

  return listItemTypes().find((item) => item.id === input.itemTypeId) ?? null;
}

export function updateItemTypeImageFromAdmin(input: {
  actorId: number;
  itemTypeId: number;
  imageUrl: string | null;
}) {
  const existing = db
    .prepare("SELECT id, name, image_url FROM item_types WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.itemTypeId) as { id: number; name: string; image_url: string | null } | undefined;

  if (!existing) {
    return null;
  }

  const rawImageUrl = typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  const normalizedImageUrl = rawImageUrl ? rawImageUrl.slice(0, 2048) : null;

  db.prepare(
    `UPDATE item_types
     SET image_url = ?
     WHERE id = ? AND is_active = 1`
  ).run(normalizedImageUrl, input.itemTypeId);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "ITEM_TYPE_IMAGE_UPDATE",
    JSON.stringify({
      itemTypeId: input.itemTypeId,
      name: existing.name,
      previousImageUrl: existing.image_url ?? null,
      nextImageUrl: normalizedImageUrl,
    }),
  );

  return listItemTypes().find((item) => item.id === input.itemTypeId) ?? null;
}

export function deactivateItemTypeFromAdmin(input: {
  actorId: number;
  itemTypeId: number;
}) {
  const activeCount = db
    .prepare("SELECT COUNT(*) AS count FROM item_types WHERE is_active = 1")
    .get() as { count: number };

  if (activeCount.count <= 1) {
    return { ok: false as const, reason: "cannot_deactivate_last_item" as const };
  }

  const existing = db
    .prepare("SELECT id, name FROM item_types WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.itemTypeId) as { id: number; name: string } | undefined;

  if (!existing) {
    return { ok: false as const, reason: "not_found" as const };
  }

  db.prepare("UPDATE item_types SET is_active = 0 WHERE id = ? AND is_active = 1").run(input.itemTypeId);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "ITEM_TYPE_DEACTIVATE",
    JSON.stringify({ itemTypeId: input.itemTypeId, name: existing.name }),
  );

  return { ok: true as const };
}

export function createUser(input: {
  email: string;
  password: string;
  assignments?: Array<{ itemTypeId: number; quantity: number }>;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = bcrypt.hashSync(input.password, 12);
  const qrToken = randomBytes(24).toString("hex");

  const result = db
    .prepare(
      `INSERT INTO users (
        username,
        password_hash,
        role,
        meal_tickets,
        dinner_tickets,
        clothing_item,
        accessory_item,
        clothing_status,
        qr_token
      ) VALUES (?, ?, 'user', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      normalizedEmail,
      passwordHash,
      0,
      0,
      "",
      "",
      "NONE",
      qrToken,
    );

  const userId = Number(result.lastInsertRowid);
  const assignmentMap = new Map<number, number>();
  const types = listItemTypes();
  const activeTypeIds = new Set(types.map((type) => type.id));

  for (const assignment of input.assignments ?? []) {
    if (!activeTypeIds.has(assignment.itemTypeId)) {
      continue;
    }

    assignmentMap.set(assignment.itemTypeId, Math.max(0, assignment.quantity));
  }

  for (const type of types) {
    db.prepare(
      "INSERT INTO user_item_balances (user_id, item_type_id, quantity) VALUES (?, ?, ?)"
    ).run(userId, type.id, assignmentMap.get(type.id) ?? 0);
  }

  return getUserById(userId);
}

export function createAdminStaffFromAdmin(input: {
  actorId: number;
  email: string;
  password: string;
  scope: AdminScopeValue;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  const passwordHash = bcrypt.hashSync(input.password, 12);
  const qrToken = randomBytes(24).toString("hex");

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ? LIMIT 1")
    .get(normalizedEmail) as { id: number } | undefined;

  if (existing) {
    return { ok: false as const, reason: "email_exists" as const };
  }

  const result = db
    .prepare(
      `INSERT INTO users (
        username,
        password_hash,
        role,
        admin_scope,
        meal_tickets,
        dinner_tickets,
        clothing_item,
        accessory_item,
        clothing_status,
        qr_token
      ) VALUES (?, ?, 'admin', ?, 0, 0, '', '', 'NONE', ?)`
    )
    .run(normalizedEmail, passwordHash, input.scope, qrToken);

  const userId = Number(result.lastInsertRowid);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(
    input.actorId,
    userId,
    "ADMIN_STAFF_CREATE",
    JSON.stringify({
      username: normalizedEmail,
      scope: input.scope,
    }),
  );

  const member = listAdminStaff().find((staff) => staff.id === userId) ?? null;
  return { ok: true as const, member };
}

export function deleteUserById(id: number) {
  const transaction = db.transaction((targetUserId: number) => {
    const existing = db
      .prepare("SELECT id FROM users WHERE id = ? AND role = 'user' LIMIT 1")
      .get(targetUserId) as { id: number } | undefined;

    if (!existing) {
      return false;
    }

    db.prepare("DELETE FROM user_item_balances WHERE user_id = ?").run(targetUserId);
    db.prepare("DELETE FROM scan_daily_usage WHERE user_id = ?").run(targetUserId);
    const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'").run(targetUserId);
    return result.changes > 0;
  });

  return transaction(id);
}

export function deleteUserFromAdmin(input: { actorId: number; targetUserId: number }) {
  const transaction = db.transaction(({ actorId, targetUserId }: { actorId: number; targetUserId: number }) => {
    const existing = db
      .prepare("SELECT id FROM users WHERE id = ? AND role = 'user' LIMIT 1")
      .get(targetUserId) as { id: number } | undefined;

    if (!existing) {
      return false;
    }

    db.prepare("DELETE FROM user_item_balances WHERE user_id = ?").run(targetUserId);
    db.prepare("DELETE FROM scan_daily_usage WHERE user_id = ?").run(targetUserId);
    const result = db.prepare("DELETE FROM users WHERE id = ? AND role = 'user'").run(targetUserId);

    if (result.changes > 0) {
      db.prepare(
        "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
      ).run(actorId, targetUserId, "USER_DELETE", JSON.stringify({ action: "DELETE_USER" }));
    }

    return result.changes > 0;
  });

  return transaction(input);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compareSync(plain, hash);
}

function hashPasswordSetupToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createPasswordSetupTokenFromAdmin(input: {
  actorId: number;
  targetUserId: number;
  reason: "user_create" | "user_reset" | "staff_create";
  expiresHours?: number;
}) {
  const target = db
    .prepare("SELECT id, username FROM users WHERE id = ? LIMIT 1")
    .get(input.targetUserId) as { id: number; username: string } | undefined;

  if (!target) {
    return { ok: false as const, reason: "target_not_found" as const };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordSetupToken(rawToken);
  const safeExpiresHours = Math.max(1, Math.min(72, Number(input.expiresHours ?? 48)));

  db.prepare(
    "UPDATE password_setup_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL"
  ).run(input.targetUserId);

  db.prepare(
    `INSERT INTO password_setup_tokens (user_id, actor_id, token_hash, reason, expires_at)
     VALUES (?, ?, ?, ?, datetime('now', ?))`
  ).run(input.targetUserId, input.actorId, tokenHash, input.reason, `+${safeExpiresHours} hours`);

  const tokenRow = db
    .prepare("SELECT expires_at FROM password_setup_tokens WHERE token_hash = ? LIMIT 1")
    .get(tokenHash) as { expires_at: string } | undefined;

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(
    input.actorId,
    input.targetUserId,
    "PASSWORD_SETUP_TOKEN_ISSUED",
    JSON.stringify({
      reason: input.reason,
      expiresAt: tokenRow?.expires_at ?? null,
    }),
  );

  return {
    ok: true as const,
    token: rawToken,
    expiresAt: tokenRow?.expires_at ?? null,
    targetEmail: target.username,
  };
}

export function consumePasswordSetupToken(input: {
  token: string;
  newPassword: string;
}) {
  const tokenHash = hashPasswordSetupToken(input.token);
  const tokenRow = db
    .prepare(
      `SELECT id, user_id
       FROM password_setup_tokens
       WHERE token_hash = ?
         AND used_at IS NULL
         AND expires_at >= CURRENT_TIMESTAMP
       LIMIT 1`
    )
    .get(tokenHash) as { id: number; user_id: number } | undefined;

  if (!tokenRow) {
    return { ok: false as const, reason: "invalid_or_expired" as const };
  }

  const passwordHash = bcrypt.hashSync(input.newPassword, 12);

  db.prepare(
    `UPDATE users
     SET password_hash = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(passwordHash, tokenRow.user_id);

  db.prepare("UPDATE password_setup_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").run(tokenRow.id);
  db.prepare(
    "UPDATE password_setup_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL"
  ).run(tokenRow.user_id);

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(
    0,
    tokenRow.user_id,
    "PASSWORD_SETUP_COMPLETED",
    JSON.stringify({ via: "token" }),
  );

  return {
    ok: true as const,
    user: getUserById(tokenRow.user_id),
  };
}

export function updateUserFromAdmin(input: {
  actorId: number;
  targetUserId: number;
  mode: "add" | "set";
  itemQuantities: Array<{ itemTypeId: number; quantity: number }>;
  note?: string;
}) {
  const existing = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'user' LIMIT 1")
    .get(input.targetUserId) as DbUser | undefined;

  if (!existing) {
    return null;
  }

  for (const entry of input.itemQuantities) {
    const current = db
      .prepare("SELECT quantity FROM user_item_balances WHERE user_id = ? AND item_type_id = ? LIMIT 1")
      .get(input.targetUserId, entry.itemTypeId) as { quantity: number } | undefined;

    const quantity = Math.max(0, entry.quantity);
    const nextQty = input.mode === "set" ? quantity : Math.max(0, (current?.quantity ?? 0) + quantity);

    db.prepare(
      `INSERT INTO user_item_balances (user_id, item_type_id, quantity)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_type_id)
       DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`
    ).run(input.targetUserId, entry.itemTypeId, nextQty);
  }

  db.prepare("UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.targetUserId);

  const details = JSON.stringify({
    mode: input.mode,
    itemQuantities: input.itemQuantities,
    note: input.note ?? "",
  });

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(input.actorId, input.targetUserId, "USER_UPDATE", details);

  return getUserById(input.targetUserId);
}

export function applyGlobalTicketDelta(input: {
  actorId: number;
  itemTypeId: number;
  mode: "add" | "set";
  quantity: number;
}) {
  const itemType = db
    .prepare("SELECT id FROM item_types WHERE id = ? AND is_active = 1 LIMIT 1")
    .get(input.itemTypeId) as { id: number } | undefined;

  if (!itemType) {
    return null;
  }

  if (input.quantity === 0 && input.mode === "add") {
    return { updatedUsers: 0 };
  }

  const users = db.prepare("SELECT id FROM users WHERE role = 'user'").all() as Array<{ id: number }>;

  for (const user of users) {
    const current = db
      .prepare("SELECT quantity FROM user_item_balances WHERE user_id = ? AND item_type_id = ? LIMIT 1")
      .get(user.id, input.itemTypeId) as { quantity: number } | undefined;

    const safeQty = Math.max(0, input.quantity);
    const nextQty = input.mode === "set" ? safeQty : Math.max(0, (current?.quantity ?? 0) + safeQty);

    db.prepare(
      `INSERT INTO user_item_balances (user_id, item_type_id, quantity)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_type_id)
       DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP`
    ).run(user.id, input.itemTypeId, nextQty);
  }

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
  ).run(
    input.actorId,
    "USERS_BULK_TICKET_UPDATE",
    JSON.stringify({
      itemTypeId: input.itemTypeId,
      mode: input.mode,
      quantity: input.quantity,
      updatedUsers: users.length,
    }),
  );

  return { updatedUsers: users.length };
}

export function listRecentAdminActivity(input?: {
  limit?: number;
  action?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}) {
  const safeLimit = Math.max(1, Math.min(30, Number(input?.limit ?? 8)));
  const filters: string[] = [];
  const params: Array<string | number> = [];

  const trimmedAction = (input?.action ?? "").trim();
  if (trimmedAction.length > 0) {
    filters.push("logs.action = ?");
    params.push(trimmedAction);
  }

  const trimmedDateFrom = (input?.dateFrom ?? "").trim();
  if (trimmedDateFrom.length > 0) {
    filters.push("date(logs.created_at) >= date(?)");
    params.push(trimmedDateFrom);
  }

  const trimmedDateTo = (input?.dateTo ?? "").trim();
  if (trimmedDateTo.length > 0) {
    filters.push("date(logs.created_at) <= date(?)");
    params.push(trimmedDateTo);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT
         logs.id,
         logs.action,
         logs.details,
         logs.created_at,
         COALESCE(actor.username, 'sistema') AS actor_email,
         COALESCE(target.username, 'varios') AS target_email
       FROM audit_logs AS logs
       LEFT JOIN users AS actor ON actor.id = logs.actor_id
       LEFT JOIN users AS target ON target.id = logs.target_user_id
       ${whereClause}
       ORDER BY logs.id DESC
       LIMIT ?`
    )
    .all(...params, safeLimit) as DbAuditLog[];

  return rows.map(mapActivity);
}

export function listUserActivity(targetUserId: number, limit = 8) {
  const safeLimit = Math.max(1, Math.min(30, limit));

  const rows = db
    .prepare(
      `SELECT
         logs.id,
         logs.action,
         logs.details,
         logs.created_at,
         COALESCE(actor.username, 'sistema') AS actor_email,
         COALESCE(target.username, 'mi cuenta') AS target_email
       FROM audit_logs AS logs
       LEFT JOIN users AS actor ON actor.id = logs.actor_id
       LEFT JOIN users AS target ON target.id = logs.target_user_id
       WHERE logs.target_user_id = ?
       ORDER BY logs.id DESC
       LIMIT ?`
    )
    .all(targetUserId, safeLimit) as DbAuditLog[];

  return rows.map(mapActivity);
}

function toIsoDateOnly(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getAdminPermissionDeniedMetrics(days = 7) {
  const safeDays = Math.max(1, Math.min(30, Number(days) || 7));

  const rows = db
    .prepare(
      `SELECT details, created_at
       FROM audit_logs
       WHERE action = 'ADMIN_PERMISSION_DENIED'
         AND datetime(created_at) >= datetime('now', ?)
       ORDER BY created_at DESC`
    )
    .all(`-${safeDays} days`) as DbAuditLogDetailsRow[];

  const endpointCount = new Map<string, number>();
  const dayCount = new Map<string, number>();
  let last24hDenied = 0;
  const nowMs = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const createdAtMs = new Date(row.created_at).getTime();
    if (Number.isFinite(createdAtMs) && nowMs - createdAtMs <= dayMs) {
      last24hDenied += 1;
    }

    const createdDate = Number.isFinite(createdAtMs) ? new Date(createdAtMs) : new Date();
    const dayKey = toIsoDateOnly(createdDate);
    dayCount.set(dayKey, (dayCount.get(dayKey) ?? 0) + 1);

    let pathname = "desconocido";
    try {
      const parsed = JSON.parse(row.details) as { pathname?: string | null };
      const candidate = (parsed.pathname ?? "").trim();
      if (candidate.length > 0) {
        pathname = candidate;
      }
    } catch {
      // Ignore malformed detail payloads.
    }

    endpointCount.set(pathname, (endpointCount.get(pathname) ?? 0) + 1);
  }

  const byDay: Array<{ day: string; count: number }> = [];
  const today = new Date();
  for (let index = safeDays - 1; index >= 0; index -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - index);
    const dayKey = toIsoDateOnly(day);
    byDay.push({
      day: dayKey,
      count: dayCount.get(dayKey) ?? 0,
    });
  }

  const byEndpoint = Array.from(endpointCount.entries())
    .map(([pathname, count]) => ({ pathname, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8);

  return {
    days: safeDays,
    totalDenied: rows.length,
    last24hDenied,
    byDay,
    byEndpoint,
  };
}

export function logAdminPermissionDenied(input: {
  actorId?: number | null;
  actorRole?: string | null;
  actorScope?: string | null;
  requiredPermission: "admin.read" | "admin.scan" | "admin.manage" | "admin.mode.execute";
  pathname: string;
  method: string;
  reason: "missing_session" | "insufficient_scope";
}) {
  try {
    const safeActorId = typeof input.actorId === "number" && input.actorId > 0 ? input.actorId : 0;

    db.prepare(
      "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, 0, ?, ?)"
    ).run(
      safeActorId,
      "ADMIN_PERMISSION_DENIED",
      JSON.stringify({
        requiredPermission: input.requiredPermission,
        pathname: input.pathname,
        method: input.method,
        reason: input.reason,
        actorRole: input.actorRole ?? null,
        actorScope: input.actorScope ?? null,
      }),
    );
  } catch {
    // Do not block the main request flow if audit persistence fails.
  }
}

export function resetUserPasswordFromAdmin(input: {
  actorId: number;
  targetUserId: number;
  newPassword: string;
}) {
  const existing = db
    .prepare("SELECT * FROM users WHERE id = ? AND role = 'user' LIMIT 1")
    .get(input.targetUserId) as DbUser | undefined;

  if (!existing) {
    return null;
  }

  const passwordHash = bcrypt.hashSync(input.newPassword, 12);

  db.prepare(
    `UPDATE users
     SET password_hash = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(passwordHash, input.targetUserId);

  const details = JSON.stringify({
    action: "RESET_PASSWORD",
  });

  db.prepare(
    "INSERT INTO audit_logs (actor_id, target_user_id, action, details) VALUES (?, ?, ?, ?)"
  ).run(input.actorId, input.targetUserId, "USER_PASSWORD_RESET", details);

  return getUserById(input.targetUserId);
}
