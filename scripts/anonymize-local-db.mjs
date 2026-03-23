import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function tableExists(db, tableName) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName),
  );
}

function randomQrToken() {
  return randomBytes(24).toString("hex");
}

function main() {
  const dbArg = process.argv[2];
  const dbPath = dbArg
    ? path.resolve(process.cwd(), dbArg)
    : path.join(process.cwd(), "data", "app.db");

  if (!fs.existsSync(dbPath)) {
    console.error(`[anonymize-db] No existe la base de datos: ${dbPath}`);
    process.exit(1);
  }

  const backupPath = `${dbPath}.${nowStamp()}.bak`;
  fs.copyFileSync(dbPath, backupPath);

  const db = new Database(dbPath);

  const summary = {
    usersUpdated: 0,
    adminUsers: 0,
    normalUsers: 0,
    balancesUpdated: 0,
    usageRowsDeleted: 0,
    undoRowsDeleted: 0,
    passwordTokensDeleted: 0,
    auditRowsAnonymized: 0,
  };

  try {
    const run = db.transaction(() => {
      if (tableExists(db, "users")) {
        const rows = db
          .prepare("SELECT id, role FROM users ORDER BY id ASC")
          .all();

        let adminIndex = 1;
        let userIndex = 1;

        const updateUser = db.prepare(
          `UPDATE users
           SET username = ?,
               qr_token = ?,
               meal_tickets = 0,
               dinner_tickets = 0,
               clothing_item = '',
               accessory_item = '',
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        );

        for (const row of rows) {
          const isAdmin = row.role === "admin";
          const username = isAdmin
            ? adminIndex === 1
              ? "admin@example.local"
              : `admin${adminIndex}@example.local`
            : `user${userIndex}@example.local`;

          if (isAdmin) {
            adminIndex += 1;
            summary.adminUsers += 1;
          } else {
            userIndex += 1;
            summary.normalUsers += 1;
          }

          updateUser.run(username, randomQrToken(), row.id);
          summary.usersUpdated += 1;
        }
      }

      if (tableExists(db, "user_item_balances")) {
        const result = db.prepare(
          `UPDATE user_item_balances
           SET quantity = ABS((user_id * item_type_id) % 4),
               updated_at = CURRENT_TIMESTAMP`,
        ).run();
        summary.balancesUpdated = result.changes;
      }

      if (tableExists(db, "scan_daily_usage")) {
        summary.usageRowsDeleted = db.prepare("DELETE FROM scan_daily_usage").run().changes;
      }

      if (tableExists(db, "scan_undo_actions")) {
        summary.undoRowsDeleted = db.prepare("DELETE FROM scan_undo_actions").run().changes;
      }

      if (tableExists(db, "password_setup_tokens")) {
        summary.passwordTokensDeleted = db.prepare("DELETE FROM password_setup_tokens").run().changes;
      }

      if (tableExists(db, "audit_logs")) {
        summary.auditRowsAnonymized = db.prepare(
          `UPDATE audit_logs
           SET details = '{"anonymized":true}'`,
        ).run().changes;
      }
    });

    run();

    console.log("[anonymize-db] Base de datos anonimizada correctamente.");
    console.log(`[anonymize-db] Backup creado: ${backupPath}`);
    console.log("[anonymize-db] Resumen:");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    db.close();
  }
}

main();
