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
    "Downcity is agent infrastructure for AI builders shipping many agent-powered products and workflows on one reusable runtime.",
  homepage: "https://downcity.ai",
};
