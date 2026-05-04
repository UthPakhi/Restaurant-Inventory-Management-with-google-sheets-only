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
    // TypeScript is overly strict with mapped types and IDBPDatabase methods here
    return db.get(tableName as any, 'data') as Promise<any[][] | undefined>;
  }

  async setTable(tableName: keyof LocalDBSchema, data: any[][]): Promise<void> {
    const db = await this.dbPromise;
    await db.put(tableName as any, data, 'data');
  }

  async clearAll(): Promise<void> {
      const db = await this.dbPromise;
      const tx = db.transaction(['masters_items', 'masters_depts', 'masters_suppliers', 'purchases', 'issues', 'batches'], 'readwrite');
      await Promise.all([
          tx.objectStore('masters_items').clear(),
          tx.objectStore('masters_depts').clear(),
          tx.objectStore('masters_suppliers').clear(),
          tx.objectStore('purchases').clear(),
          tx.objectStore('issues').clear(),
          tx.objectStore('batches').clear(),
          tx.done
      ]);
  }
}

export const localDb = new LocalDB();
