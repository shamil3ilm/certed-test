import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cert-Ed Academia — App",
};

// Portal pages are auth-dependent — never statically cache/prerender them
// (otherwise build-time redirects get baked in without a Location header).
export const dynamic = "force-dynamic";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">{children}</div>
  );
}
