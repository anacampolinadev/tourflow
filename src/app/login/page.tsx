import { signIn } from "@/modules/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="narrow">
    <p>TourFlow Fleet</p><h1>Entrar</h1>
    <p>Use o e-mail cadastrado pela sua organização. Enviaremos um link de acesso.</p>
    {error ? <p role="alert">Não foi possível concluir o acesso. Solicite um novo link ou contacte a administração.</p> : null}
    <form action={async (formData) => {
      "use server";
      let target: string | undefined;
      try {
        target = await signIn("nodemailer", { email: formData.get("email"), redirectTo: "/workspace", redirect: false });
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
      }
      // Avoid an intermediate auth-handler redirect being rendered at its original URL by RSC navigation.
      if (!target || new URL(target).pathname !== "/api/auth/verify-request") redirect("/login?error=EmailSignin");
      redirect("/login/check-email");
    }}>
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} />
      <button type="submit">Receber link de acesso</button>
    </form>
  </main>;
}
