import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { assetUrl, SITE_ROOT_URL } from '../../lib/assets';

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
    <>
      <header className="site-header">
        <div className="hd">
          <Link to="/admin" className="hd-brand" aria-label="Painel administrativo">
            <img src={assetUrl('assets/logo.png')} alt="Distribuidora São Paulo" width={146} height={56} />
            <div>
              <b>PAINEL DO CATÁLOGO</b>
              <span>{user?.email}</span>
            </div>
          </Link>
          <nav className="hd-nav" aria-label="Administração">
            <NavLink to="/admin" end>
              ITENS
            </NavLink>
            <NavLink to="/admin/categorias">CATEGORIAS</NavLink>
            <a href={SITE_ROOT_URL} target="_blank" rel="noopener">
              VITRINE ↗
            </a>
            <button type="button" className="hd-btn" onClick={() => void handleSignOut()} disabled={signingOut}>
              SAIR
            </button>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </>
  );
}
