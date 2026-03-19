export type DowncityProduct = {
  name: string;
  productName: string;
  version: string;
  description: string;
  homepage?: string;
};

export const product: DowncityProduct = {
  name: "downcity",
  productName: "Downcity",
  version: "1.0.0",
  description:
    "Downcity is a management and collaboration platform for AI agents, built around chat, skill, task, and memory runtime services.",
  homepage: "https://downcity.ai",
};
