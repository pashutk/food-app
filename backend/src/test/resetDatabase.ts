import db from '../db';

export function resetDatabase(): void {
  db.exec('DELETE FROM meal_logs');
  db.exec('DELETE FROM dishes');
  db.exec('DELETE FROM menus');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'meal_logs'");
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'dishes'");
}
