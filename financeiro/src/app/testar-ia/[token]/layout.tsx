import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Teste da IA Virtuosa",
  description: "Ambiente público e isolado para testar a assistente virtual da Clínica Virtuosa.",
  robots: { index: false, follow: false, nocache: true },
};

export default function PublicAiTestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
