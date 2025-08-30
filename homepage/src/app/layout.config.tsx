import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { DowncityLogo } from "@/components/optimized-image";

/**
 * Shared layout configurations
 *
 * you can customise layouts individually from:
 * Home Layout: app/(home)/layout.tsx
 * Docs Layout: app/docs/layout.tsx
 */
export const baseOptions: BaseLayoutProps = {
  nav: {
    title: <DowncityLogo size={24} />,
  },
  links: [],
};
