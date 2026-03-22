import fs from 'fs';
import path from 'path';

export default async function globalSetup() {
  const dbPath = path.resolve(__dirname, '../backend/data/test.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}
