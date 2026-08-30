import type { ReactNode } from "react";

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ops-shell">
      <a className="sales-skip" href="#konten">Lewati ke konten utama</a>
      <header className="ops-header">
        <p className="ops-wordmark">GeraiCUAN · CMS Platform</p>
        <p>Pemantauan lintas tenant</p>
      </header>
      <main id="konten">{children}</main>
    </div>
  );
}
