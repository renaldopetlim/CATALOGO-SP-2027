/** Tela exibida quando o app não consegue iniciar (ex.: .env.local ausente). */
export function StartupError({ message }: { message: string }) {
  return (
    <main>
      <div className="state err" role="alert">
        <b>Não foi possível iniciar o catálogo</b>
        <p className="detail-text startup-msg">{message}</p>
      </div>
    </main>
  );
}
