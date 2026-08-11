export class BaseRepository {
  constructor(db, collectionName) {
    this.collection = db.collection(collectionName);
  }
}
