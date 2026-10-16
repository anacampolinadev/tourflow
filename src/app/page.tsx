import Link from "next/link";

export default function Home() {
  return (
    <main>
      <p>TourFlow Fleet</p>
      <h1>TourFlow</h1>
      <p>A base para organizar a sua operação turística.</p>
      <p>Plataforma em preparação.</p>
      <Link className="button" href="/login">Entrar no seu espaço</Link>
    </main>
  );
}
