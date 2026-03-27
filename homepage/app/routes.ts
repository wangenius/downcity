import {
  type RouteConfig,
  index,
  route,
  layout,
} from "@react-router/dev/routes";

export default [
  // Homepage
  index("routes/home.tsx"),
  route("zh", "routes/home.tsx", { id: "home-zh" }),
  route("whitepaper", "routes/whitepaper.tsx"),
  route("zh/whitepaper", "routes/whitepaper.tsx", { id: "whitepaper-zh" }),
  route("start", "routes/start.tsx"),
  route("zh/start", "routes/start.tsx", { id: "start-zh" }),

  // Features page
  route("features", "routes/features.tsx"),
  route("zh/features", "routes/features.tsx", { id: "features-zh" }),

  // Product with child routes
  route("product", "routes/product.tsx", [
    index("routes/product/index.tsx"),
    route("console-ui", "routes/product/console-ui.tsx"),
    route("chrome-extension", "routes/product/chrome-extension.tsx"),
    route("sdk", "routes/product/sdk.tsx"),
    route("ui-sdk", "routes/product/ui-sdk.tsx"),
  ]),
  route(
    "zh/product",
    "routes/product.tsx",
    { id: "routes/zh/product" },
    [
      index("routes/product/index.tsx", { id: "routes/zh/product._index" }),
      route("console-ui", "routes/product/console-ui.tsx", {
        id: "routes/zh/product.console-ui",
      }),
      route("chrome-extension", "routes/product/chrome-extension.tsx", {
        id: "routes/zh/product.chrome-extension",
      }),
      route("sdk", "routes/product/sdk.tsx", {
        id: "routes/zh/product.sdk",
      }),
      route("ui-sdk", "routes/product/ui-sdk.tsx", {
        id: "routes/zh/product.ui-sdk",
      }),
    ],
  ),

  // Resources with child routes
  route("resources", "routes/resources.tsx", [
    index("routes/resources._index.tsx"),
    route("skills", "routes/resources.skills.tsx"),
    route("marketplace", "routes/resources.marketplace.tsx"),
    route("hosting", "routes/resources.hosting.tsx"),
  ]),
  route(
    "zh/resources",
    "routes/resources.tsx",
    { id: "routes/zh/resources" },
    [
      index("routes/resources._index.tsx", { id: "routes/zh/resources._index" }),
      route("skills", "routes/resources.skills.tsx", {
        id: "routes/zh/resources.skills",
      }),
      route("marketplace", "routes/resources.marketplace.tsx", {
        id: "routes/zh/resources.marketplace",
      }),
      route("hosting", "routes/resources.hosting.tsx", {
        id: "routes/zh/resources.hosting",
      }),
    ],
  ),

  // Community with child routes
  route("community", "routes/community.tsx", [
    index("routes/community._index.tsx"),
    route("faq", "routes/community.faq.tsx"),
    route("roadmap", "routes/community.roadmap.tsx"),
  ]),
  route(
    "zh/community",
    "routes/community.tsx",
    { id: "routes/zh/community" },
    [
      index("routes/community._index.tsx", { id: "routes/zh/community._index" }),
      route("faq", "routes/community.faq.tsx", { id: "routes/zh/community.faq" }),
      route("roadmap", "routes/community.roadmap.tsx", {
        id: "routes/zh/community.roadmap",
      }),
    ],
  ),

  // Docs routes with layout
  layout("routes/docs/layout.tsx", [
    // English docs
    route("en/docs/*", "routes/docs/page.tsx", { id: "docs-en" }),
    route("docs/*", "routes/docs/redirect.tsx", { id: "docs-redirect" }), // Redirect to /en/docs

    // Chinese docs
    route("zh/docs/*", "routes/docs/page.tsx", { id: "docs-zh" }),
  ]),

  // Developer docs routes with layout
  layout("routes/devdocs/layout.tsx", [
    route("en/devdocs/*", "routes/devdocs/page.tsx", { id: "devdocs-en" }),
    route("devdocs/*", "routes/devdocs/redirect.tsx", { id: "devdocs-redirect" }),
    route("zh/devdocs/*", "routes/devdocs/page.tsx", { id: "devdocs-zh" }),
  ]),

  // UI SDK docs routes with layout
  layout("routes/ui-sdk-docs/layout.tsx", [
    route("en/ui-sdk-docs/*", "routes/ui-sdk-docs/page.tsx", { id: "ui-sdk-docs-en" }),
    route("ui-sdk-docs/*", "routes/ui-sdk-docs/redirect.tsx", {
      id: "ui-sdk-docs-redirect",
    }),
    route("zh/ui-sdk-docs/*", "routes/ui-sdk-docs/page.tsx", { id: "ui-sdk-docs-zh" }),
  ]),

  // API routes
  route("api/search", "routes/docs/search.ts"),
  route("api/devdocs/search", "routes/devdocs/search.ts"),
  route("api/ui-sdk-docs/search", "routes/ui-sdk-docs/search.ts"),
] satisfies RouteConfig;
