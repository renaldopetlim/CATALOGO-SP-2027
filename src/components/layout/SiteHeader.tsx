import { Link, NavLink } from 'react-router-dom';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="hd">
        <Link to="/" className="hd-brand" aria-label="Distribuidora São Paulo — página inicial">
          <img src="/assets/logo.png" alt="Distribuidora São Paulo" width={146} height={56} />
          <div>
            <b>CATÁLOGO 2027</b>
            <span>Distribuidora São Paulo · O Atacado da Construção</span>
          </div>
        </Link>
        <nav className="hd-nav" aria-label="Principal">
          <NavLink to="/" end>
            INÍCIO
          </NavLink>
          <NavLink to="/catalogo">CATÁLOGO</NavLink>
        </nav>
      </div>
    </header>
  );
}
