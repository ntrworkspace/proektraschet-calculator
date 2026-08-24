import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ПроектРасчёт — локальный калькулятор",
  description: "Нормативный расчёт стоимости проектных работ и режим совместимости.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
