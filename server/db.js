const { JSONFilePreset } = require("lowdb/node");

const defaultData = {
  users: [],
  clients: [],
  cases: [],
  documents: [],
  messages: [],
  resetTokens: [],
  auditLogs: []
};

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = JSONFilePreset("server/data.json", defaultData).then((db) => {
      db.data.users = db.data.users || [];
      db.data.clients = db.data.clients || [];
      db.data.cases = db.data.cases || [];
      db.data.documents = db.data.documents || [];
      db.data.messages = db.data.messages || [];
      db.data.resetTokens = db.data.resetTokens || [];
      db.data.auditLogs = db.data.auditLogs || [];
      return db;
    });
  }
  return dbPromise;
}

module.exports = { getDb };
