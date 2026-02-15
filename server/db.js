const { JSONFilePreset } = require("lowdb/node");
const { MongoClient } = require("mongodb");

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
let mongoClient;

function getDb() {
  if (!dbPromise) {
    const mongoUri = process.env.MONGODB_URI || "";
    if (mongoUri) {
      dbPromise = (async () => {
        if (!mongoClient) {
          mongoClient = new MongoClient(mongoUri);
          await mongoClient.connect();
        }
        const dbName = process.env.MONGODB_DB_NAME || "lawease";
        const colName = process.env.MONGODB_COLLECTION || "app_state";
        const col = mongoClient.db(dbName).collection(colName);
        const key = process.env.MONGODB_STATE_KEY || "primary";

        const row = await col.findOne({ _id: key });
        const current = Object.assign({}, defaultData, row && row.data ? row.data : {});

        return {
          data: current,
          async write() {
            await col.updateOne(
              { _id: key },
              {
                $set: {
                  data: this.data,
                  updatedAt: new Date().toISOString()
                }
              },
              { upsert: true }
            );
          }
        };
      })();
    } else {
      const file = process.env.DB_FILE || "server/data.json";
      dbPromise = JSONFilePreset(file, defaultData);
    }

    dbPromise = dbPromise.then((db) => {
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
