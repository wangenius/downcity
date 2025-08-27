import { ModelMessage } from "ai";

export class Session {
  id: string;
  messages: ModelMessage[];
  createdAt: Date;
  updatedAt: Date;
  constructor(id: string) {
    this.id = id;
    this.messages = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}
