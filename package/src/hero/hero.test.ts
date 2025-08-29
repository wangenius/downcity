import { Hero } from "./Hero";

const hero = Hero.create();
const res = await hero.chat("你好");
console.log(res);
