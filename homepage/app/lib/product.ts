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
    "Deploy your repository directly as a conversational, executable AI Agent. No extra orchestration required—just ship it.",
  homepage: "https://downcity.ai",
};
