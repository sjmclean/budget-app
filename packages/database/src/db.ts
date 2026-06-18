import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { initDatabase } from "./initDatabase.js";

export function createDatabase(filePath: string) {
  const sqlite = new Database(filePath);
  initDatabase(sqlite);
  return drizzle(sqlite);
}
