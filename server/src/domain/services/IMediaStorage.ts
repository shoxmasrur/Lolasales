export interface StoredMedia {
  /** Bazada saqlanadigan nisbiy yo'l — absolyut yo'l tashqariga chiqmaydi. */
  readonly path: string;
  readonly sizeBytes: number;
}

export interface IMediaStorage {
  save(data: Buffer, fileName: string): Promise<StoredMedia>;
  read(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
}
