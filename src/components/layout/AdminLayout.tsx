import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { assetUrl, SITE_ROOT_URL } from '../../lib/assets';
import { LiveIndicator } from '../ui/LiveIndicator';
// CSS só do painel: fica no pacote carregado sob demanda, a vitrine não o recebe.
import '../../styles/admin.css';

function NavIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  items: 'M3 5h18M3 12h18M3 19h18M7 5v14',
  categories: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  brands: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01',
  pending: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  store: 'M14 3h7v7M10 14 21 3M21 14v7H3V3h7',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
};

/** Painel em tela cheia: barra lateral fixa + área principal fluida. */
export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="admin-shell">
      <p className="admin-small-screen" role="note">
        O painel foi pensado para computador. Para uma experiência melhor, use uma tela com pelo menos 768px de largura.
      </p>

      <aside className="admin-sidebar" aria-label="Menu do painel">
        <div className="sb-brand">
          <img src={assetUrl('assets/logo.png')} alt="Distribuidora São Paulo" width={146} height={56} />
          <div>
            <b>CATÁLOGO 2027</b>
            <span>Painel de gestão</span>
          </div>
        </div>

        <nav className="sb-nav" aria-label="Administração">
          <NavLink to="/admin" end>
            <NavIcon path={ICONS.items} />
            Itens do catálogo
          </NavLink>
          <NavLink to="/admin/categorias">
            <NavIcon path={ICONS.categories} />
            Categorias
          </NavLink>
          <NavLink to="/admin/marcas">
            <NavIcon path={ICONS.brands} />
            Marcas
          </NavLink>
          <span className="sb-section">Sistema interno</span>
          <NavLink to="/admin/pendentes">
            <NavIcon path={ICONS.pending} />
            Pendentes no catálogo
          </NavLink>
          <NavLink to="/admin/importar">
            <NavIcon path={ICONS.upload} />
            Importar planilha
          </NavLink>
          <span className="sb-section">Vitrine</span>
          <a href={SITE_ROOT_URL} target="_blank" rel="noopener">
            <NavIcon path={ICONS.store} />
            Ver vitrine pública
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </nav>

        <div className="sb-foot">
          <div className="sb-live">
            <LiveIndicator showOffline />
          </div>
          <div className="sb-user" title={user?.email ?? undefined}>
            <span className="sb-avatar" aria-hidden="true">
              {(user?.email ?? '?').charAt(0).toUpperCase()}
            </span>
            <span className="sb-email">{user?.email}</span>
          </div>
          <button type="button" className="sb-logout" onClick={() => void handleSignOut()} disabled={signingOut}>
            <NavIcon path={ICONS.logout} />
            {signingOut ? 'Saindo…' : 'Sair'}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
