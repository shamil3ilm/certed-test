import type { Metadata } from "next";
import { PortalHeader } from "./PortalHeader";
import { PortalProviders } from "./Providers";

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
    <div className="prt-scope flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <PortalProviders>
        <PortalHeader />
        <div className="flex-1">{children}</div>
        <footer className="mt-8 border-t border-slate-200">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs leading-relaxed text-slate-400 sm:flex-row">
            <div className="text-center sm:text-left">
              <p className="font-semibold text-slate-500">Cert-Ed Academia</p>
              <p className="mt-0.5">© 2026 Cert-Ed Academia · v1.0.0</p>
            </div>
            <div className="text-center sm:text-right">
              <p>Come, let&apos;s learn together!</p>
              <p className="mt-0.5">hello@certedacademia.com · +91 98765 43210</p>
            </div>
          </div>
        </footer>
      </PortalProviders>
    </div>
  );
}
