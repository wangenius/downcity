import { ModelMessage } from "ai";
import { v4 } from "uuid";

export interface ShotMeta {
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShotData {
  messages: ModelMessage[];
}

export class Shot {
  private readonly _id: string;
  private _data: ShotData;
  private _meta: ShotMeta;

  constructor(id: string, meta: ShotMeta, data: ShotData) {
    this._id = id;
    this._data = data;
    this._meta = meta;
  }

  get id(): string {
    return this._id;
  }

  static create() {
    return new Shot(
      v4(),
      {
        title: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        messages: [],
      }
    );
  }

  push(message: ModelMessage) {
    this._data.messages = [...this._data.messages, message];
    this._meta.updatedAt = new Date();
  }

  replace(data: ShotData, meta: ShotMeta) {
    this._data = data;
    this._meta = meta;
  }

  setTitle(title: string) {
    this._meta.title = title;
  }

  get title(): string {
    return this._meta.title;
  }

  get meta(): ShotMeta {
    return this._meta;
  }

  get messages(): ModelMessage[] {
    return this._data.messages;
  }

  get data(): ShotData {
    return this._data;
  }
}
