import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCHEMA } from './schema';

export class BookDatabase {
  private db: Database.Database | null = null;

  constructor(private filePath: string) {}

  open(): Database.Database {
    if (this.db) return this.db;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new Database(this.filePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA);
    const ver = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    if (!ver) {
      this.db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '1')").run();
    }
    return this.db;
  }

  get conn(): Database.Database {
    if (!this.db) return this.open();
    return this.db;
  }

  close(): void {
    if (this.db) {
      try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
      this.db.close();
      this.db = null;
    }
  }
}
