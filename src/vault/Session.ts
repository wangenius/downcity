import { ModelMessage } from "ai";
import { v4 } from "uuid";

export interface SessionMeta {
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionData {
  messages: ModelMessage[];
}

export class Session {
  private readonly _id: string;
  private _data: SessionData;
  private _meta: SessionMeta;

  constructor(id: string, meta: SessionMeta, data: SessionData) {
    this._id = id;
    this._data = data;
    this._meta = meta;
  }

  get id(): string {
    return this._id;
  }

  static create() {
    return new Session(
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

  replace(data: SessionData, meta: SessionMeta) {
    this._data = data;
    this._meta = meta;
  }

  setTitle(title: string) {
    this._meta.title = title;
  }

  get title(): string {
    return this._meta.title;
  }

  get meta(): SessionMeta {
    return this._meta;
  }

  get messages(): ModelMessage[] {
    return this._data.messages;
  }

  get data(): SessionData {
    return this._data;
  }
}
