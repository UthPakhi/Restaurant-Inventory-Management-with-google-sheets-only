import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface LocalDBSchema extends DBSchema {
  masters_items: {
    key: string;
    value: any[];
  };
  masters_depts: {
    key: string;
    value: any[];
  };
  masters_suppliers: {
    key: string;
    value: any[];
  };
  purchases: {
    key: string;
    value: any[];
  };
  issues: {
    key: string;
    value: any[];
  };
  batches: {
    key: string;
    value: any[];
  };
}

class LocalDB {
  private dbPromise: Promise<IDBPDatabase<LocalDBSchema>>;

  constructor() {
    this.dbPromise = openDB<LocalDBSchema>('resto-manage-db', 1, {
      upgrade(db) {
        db.createObjectStore('masters_items');
        db.createObjectStore('masters_depts');
        db.createObjectStore('masters_suppliers');
        db.createObjectStore('purchases');
        db.createObjectStore('issues');
        db.createObjectStore('batches');
      },
    });
  }

  async getTable(tableName: keyof LocalDBSchema): Promise<any[][] | undefined> {
    const db = await this.dbPromise;
    return db.get(tableName, 'data');
  }

  async setTable(tableName: keyof LocalDBSchema, data: any[][]): Promise<void> {
    const db = await this.dbPromise;
    await db.put(tableName, data, 'data');
  }
}

export const localDb = new LocalDB();
