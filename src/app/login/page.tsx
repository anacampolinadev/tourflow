import { signIn } from "@/modules/auth";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="narrow">
    <p>TourFlow Fleet</p><h1>Entrar</h1>
    <p>Use o e-mail cadastrado pela sua organização. Enviaremos um link de acesso.</p>
    {error ? <p role="alert">Não foi possível concluir o acesso. Solicite um novo link ou contacte a administração.</p> : null}
    <form action={async (formData) => {
      "use server";
      await signIn("nodemailer", { email: formData.get("email"), redirectTo: "/workspace" });
    }}>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <button type="submit">Receber link de acesso</button>
    </form>
  </main>;
}
