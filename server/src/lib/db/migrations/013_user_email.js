export const migration = {
  id: 13,
  up(database) {
    database.exec("ALTER TABLE users ADD COLUMN email TEXT");
  },
};
