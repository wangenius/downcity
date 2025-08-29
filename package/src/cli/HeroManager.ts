import { Hero } from "../hero/Hero.js";
import { HEROS_PATH } from "./const.js";

const path = HEROS_PATH;
/**
 * 英雄管理器:
 */
export class HeroManager {
  private _hero: Hero;
  constructor(hero: Hero) {
    this._hero = hero;
  }
}
