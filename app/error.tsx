'use client';
export default function ErrorView({ reset }: { reset: () => void }) {
  return (
    <main className="loading">
      <h1>Le carnet est indisponible</h1>
      <p>Vérifiez la connexion à la base de données.</p>
      <button onClick={reset}>Réessayer</button>
    </main>
  );
}
