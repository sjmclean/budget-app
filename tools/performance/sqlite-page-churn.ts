import Database from "better-sqlite3";
import { createChurnFixture, runMutation } from "./sqliteChurnFixture";
import { compareSqliteImages } from "./sqlitePageDiff";

const before = createChurnFixture();
const mutations = ["memo","amount","payee","cleared","add","delete","assignment","split"].map(kind => {
  const {after,...result} = runMutation(before,kind); return result;
});
const {after,...warmMemo} = runMutation(createChurnFixture(20769,true),"memo");
const vacuumDatabase = new Database(before);
vacuumDatabase.exec("VACUUM");
const vacuum = compareSqliteImages(before,vacuumDatabase.serialize());
vacuumDatabase.close();
console.log(JSON.stringify({fixture:"20,769 imported records; shipped worker/schema; native SQLite; 360-character memo; 8 accounts/300 payees/80 categories; provenance for every row, tags for one third, splits for one twentieth; no pre-existing outbox; cache sensitivity uses artificial 256 KiB per month, not real projection payloads",mutations,warmMemo,vacuum},null,2));
