import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './components/auth/AuthProvider';
import { PublicLayout } from './components/layout/PublicLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

// O painel só é baixado por quem acessa /admin (vitrine mais leve).
const AdminLayout = lazy(() => import('./components/layout/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminItemsPage = lazy(() => import('./pages/admin/AdminItemsPage').then((m) => ({ default: m.AdminItemsPage })));
const AdminCategoriesPage = lazy(() =>
  import('./pages/admin/AdminCategoriesPage').then((m) => ({ default: m.AdminCategoriesPage })),
);

function AdminFallback() {
  return (
    <main>
      <p className="state" role="status">
        Carregando painel…
      </p>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/*
        HashRouter: as rotas ficam após o # (…/CATALOGO-SP-2027/#/admin).
        O GitHub Pages só recebe a parte antes do #, então recarregar (F5) ou
        abrir um link direto nunca gera 404.
      */}
      <HashRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<HomePage />} />
            <Route path="catalogo" element={<CatalogPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route
            path="admin"
            element={
              <ProtectedRoute>
                <Suspense fallback={<AdminFallback />}>
                  <AdminLayout />
                </Suspense>
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminItemsPage />} />
            <Route path="categorias" element={<AdminCategoriesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
