import { create_legal_meta, LegalPage } from "./legal";

/**
 * Terms of Service 页面路由。
 */
export function meta() {
  return create_legal_meta("terms");
}

export default function Terms() {
  return <LegalPage page_key="terms" />;
}
