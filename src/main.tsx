import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StartupError } from './components/ui/StartupError';
import './styles/tokens.css';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado em index.html.');
const root = createRoot(container);

// O App é carregado dinamicamente: se o cliente Supabase falhar na validação
// das variáveis de ambiente, mostramos a mensagem em vez de uma tela branca.
import('./App')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    root.render(<StartupError message={error instanceof Error ? error.message : String(error)} />);
  });
