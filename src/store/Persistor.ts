import { Session } from "../Session.js";

export abstract class Persistor {
  abstract save(session: Session): void;
  abstract load(id: string): Session | undefined;
  abstract delete(id: string): void;
  abstract getAll(): Session[];
}