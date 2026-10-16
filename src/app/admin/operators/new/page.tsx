import Link from "next/link";
import { OperatorForm } from "@/components/operator-form";
import { saveNewOperator } from "../actions";

export default function NewOperator() {
  return <main className="narrow"><Link href="/admin/operators">Voltar aos operadores</Link><h1>Novo operador</h1><p>O cadastro começa em negociação. A aprovação documental será disponibilizada numa etapa posterior.</p><OperatorForm action={saveNewOperator} /></main>;
}
