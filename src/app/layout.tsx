import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { AppError } from "@/lib/http";
import { getActorOrganization } from "@/server/scope";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Instrument_Serif({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrantOps",
  description: "Grant lifecycle, retrieval, and human review.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let organizationName: string | null = null;
  let setupMessage: string | null = null;
  try {
    organizationName = (await getActorOrganization()).name;
  } catch (error) {
    if (error instanceof AppError && (error.code === "CONFIG" || error.code === "AUTH")) {
      setupMessage = error.code === "CONFIG" ? error.message : null;
    } else {
      throw error;
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink">
        {organizationName ? (
          <div className="flex min-h-screen">
            <Sidebar organizationName={organizationName} />
            <main className="min-w-0 flex-1 px-8 py-8 lg:px-12">{children}</main>
          </div>
        ) : setupMessage ? (
          <main className="mx-auto max-w-xl px-6 py-20">
            <h1 className="display text-4xl">Workspace is not ready</h1>
            <p className="mt-3 text-sm leading-6 text-muted">{setupMessage}</p>
            <pre className="mt-6 overflow-auto rounded-[6px] border border-line bg-paper p-4 text-sm text-ink">
              npm run db:setup{"\n"}npm run dev
            </pre>
          </main>
        ) : (
          <main className="min-h-screen bg-canvas">{children}</main>
        )}
      </body>
    </html>
  );
}
