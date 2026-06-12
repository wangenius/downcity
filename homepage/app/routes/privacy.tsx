import { create_legal_meta, LegalPage } from "./legal";

/**
 * Privacy Policy 页面路由。
 */
export function meta() {
  return create_legal_meta("privacy");
}

export default function Privacy() {
  return <LegalPage page_key="privacy" />;
}
