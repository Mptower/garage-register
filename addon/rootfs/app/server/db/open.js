/**
 * Opens the SQLite database and applies the schema.
 *
 * Uses the built-in `node:sqlite` rather than a native addon, which is why the
 * image needs Node >= 22.6 and why nothing in it has to compile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
/**
 * Ordered, append-only. Each entry runs once and is recorded in `schema_version`;
 * never edit one that has shipped, add another.
 */
const MIGRATIONS = [
    // 1 — initial schema
    `
  CREATE TABLE vehicles (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    year                    INTEGER NOT NULL,
    make                    TEXT    NOT NULL,
    model                   TEXT    NOT NULL,
    body                    TEXT    NOT NULL DEFAULT '',
    vin                     TEXT    NOT NULL DEFAULT '',
    plate                   TEXT    NOT NULL DEFAULT '',
    plate_legend_top        TEXT    NOT NULL DEFAULT 'COLLECTOR',
    plate_legend_bottom     TEXT    NOT NULL DEFAULT 'WISCONSIN',
    photo                   TEXT    NOT NULL DEFAULT '',
    odometer                INTEGER NOT NULL DEFAULT 0,
    -- Wisconsin Collector plates are permanent and undated. Without this flag a
    -- blank expiry would read as "expired" forever.
    registration_permanent  INTEGER NOT NULL DEFAULT 0,
    registration_expires    TEXT,
    insurance_carrier       TEXT    NOT NULL DEFAULT '',
    insurance_renews        TEXT,
    agreed_value            TEXT    NOT NULL DEFAULT '',
    archived                INTEGER NOT NULL DEFAULT 0,
    sort_order              INTEGER NOT NULL DEFAULT 0,
    created_at              TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE components (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id       INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    name             TEXT    NOT NULL,
    category         TEXT    NOT NULL DEFAULT 'other',
    icon             TEXT    NOT NULL DEFAULT '',
    spec             TEXT    NOT NULL DEFAULT '',
    qty              INTEGER NOT NULL DEFAULT 1,
    -- 0 means "not tracked on this axis". Both 0 is a replace-on-failure part,
    -- which is listed and specced but never reported overdue.
    interval_miles   INTEGER NOT NULL DEFAULT 0,
    interval_months  INTEGER NOT NULL DEFAULT 0,
    last_date        TEXT,
    last_odometer    INTEGER,
    notes            TEXT    NOT NULL DEFAULT '',
    sort_order       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX idx_components_vehicle ON components(vehicle_id);

  CREATE TABLE service_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id    INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date          TEXT    NOT NULL,
    odometer      INTEGER NOT NULL DEFAULT 0,
    category      TEXT    NOT NULL DEFAULT 'Other',
    task          TEXT    NOT NULL DEFAULT '',
    parts         TEXT    NOT NULL DEFAULT '',
    cost          REAL    NOT NULL DEFAULT 0,
    note          TEXT    NOT NULL DEFAULT '',
    -- Set when the entry was produced by servicing a component. ON DELETE SET
    -- NULL so removing a component keeps the history of work already done.
    component_id  INTEGER REFERENCES components(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_entries_vehicle_date ON service_entries(vehicle_id, date DESC);

  CREATE TABLE wishlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    detail      TEXT    NOT NULL DEFAULT '',
    priority    TEXT    NOT NULL DEFAULT 'mechanical',
    estimate    REAL    NOT NULL DEFAULT 0,
    done        INTEGER NOT NULL DEFAULT 0,
    added       TEXT    NOT NULL DEFAULT (date('now')),
    completed   TEXT
  );
  CREATE INDEX idx_wishlist_vehicle ON wishlist(vehicle_id);

  CREATE TABLE modifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    detail      TEXT    NOT NULL DEFAULT '',
    status      TEXT    NOT NULL DEFAULT 'planned',
    cost        REAL    NOT NULL DEFAULT 0,
    date        TEXT    NOT NULL DEFAULT (date('now')),
    reversible  INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX idx_mods_vehicle ON modifications(vehicle_id);

  CREATE TABLE documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    title       TEXT    NOT NULL,
    kind        TEXT    NOT NULL DEFAULT 'Other',
    filed       TEXT,
    status      TEXT    NOT NULL DEFAULT 'on_file',
    note        TEXT    NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_docs_vehicle ON documents(vehicle_id);

  -- The app's own settings. Deliberately not add-on options: these are the
  -- ones an owner changes, and reaching them should not mean an admin screen.
  CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
  );
  `,
];
export function openDatabase({ file, ensureDir = true }) {
    if (ensureDir && file !== ':memory:') {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    const db = new DatabaseSync(file);
    // WAL survives an unclean stop far better than the rollback journal, and the
    // add-on is stopped by having its container killed.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    migrate(db);
    return db;
}
function migrate(db) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get();
    const current = row?.version ?? 0;
    for (let i = current; i < MIGRATIONS.length; i += 1) {
        const sql = MIGRATIONS[i];
        // Each migration is one transaction: a half-applied schema is worse than
        // none, because the version row would then disagree with reality.
        db.exec('BEGIN');
        try {
            db.exec(sql);
            db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1);
            db.exec('COMMIT');
        }
        catch (error) {
            db.exec('ROLLBACK');
            throw new Error(`Migration ${i + 1} failed: ${error.message}`, {
                cause: error,
            });
        }
    }
}
/** Checkpoints the WAL into the .db file so a cold backup captures everything. */
export function closeDatabase(db) {
    try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=open.js.map