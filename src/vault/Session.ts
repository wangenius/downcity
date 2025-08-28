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

  replace(messages: ModelMessage[], updatedAt?: Date, createdAt?: Date) {
    this._data.messages = messages;
    this._meta.updatedAt = updatedAt ?? new Date();
    this._meta.createdAt = createdAt ?? this._meta.createdAt;
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
