import { redirect } from "react-router";
import type { Route } from "./+types/redirect";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/payments/, "/en/payments");
  throw redirect(`${path}${url.search}${url.hash}`, { status: 302 });
}

export default function ServicesSdkDocsRedirect() {
  return null;
}
