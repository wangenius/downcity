import { ModelMessage } from "ai";
import { v4 } from "uuid";

export class Session {
  id: string;
  messages: ModelMessage[];
  createdAt: Date;
  updatedAt: Date;
  constructor(id?: string) {
    this.id = id || v4();
    this.messages = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
