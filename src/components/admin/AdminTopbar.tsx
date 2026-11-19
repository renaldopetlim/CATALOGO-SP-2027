import type { ReactNode } from 'react';

type AdminTopbarProps = {
  title: string;
  /** Linha discreta abaixo do título (contagem, "limpar filtros"…). */
  meta?: ReactNode;
  /** Busca e filtros. */
  tools?: ReactNode;
  /** Ação principal (ex.: "+ Novo item"). */
  action?: ReactNode;
};

/** Barra superior fixa da área principal do painel. */
export function AdminTopbar({ title, meta, tools, action }: AdminTopbarProps) {
  return (
    <header className="admin-topbar">
      <div className="tb-title">
        <h1>{title}</h1>
        {meta && <div className="tb-meta">{meta}</div>}
      </div>
      {tools && <div className="tb-tools">{tools}</div>}
      {action && <div className="tb-action">{action}</div>}
    </header>
  );
}
