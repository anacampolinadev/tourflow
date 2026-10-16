export const operatorStatuses = ["LEAD", "CONTRACTED", "ONBOARDING", "DOCS_PENDING", "UNDER_REVIEW", "APPROVED", "GENERATING", "ASSISTANT_TRAINING", "SANDBOX", "CLIENT_REVIEW", "LIVE", "RESTRICTED", "SUSPENDED"] as const;
export type OperatorStatus = (typeof operatorStatuses)[number];

// Sprint 02 intentionally exposes only commercial/onboarding transitions.
// Compliance and publication gates cannot be bypassed through the admin form.
const transitions: Partial<Record<OperatorStatus, readonly OperatorStatus[]>> = {
  LEAD: ["CONTRACTED", "SUSPENDED"],
  CONTRACTED: ["ONBOARDING", "SUSPENDED"],
  ONBOARDING: ["SUSPENDED"],
};

export class InvalidTransition extends Error {
  constructor() { super("Esta alteração de estado não está disponível nesta etapa."); this.name = "InvalidTransition"; }
}

export function transitionOperator(from: OperatorStatus, to: OperatorStatus): OperatorStatus {
  if (!transitions[from]?.includes(to)) throw new InvalidTransition();
  return to;
}

export function allowedNextStatuses(status: OperatorStatus): readonly OperatorStatus[] {
  return transitions[status] ?? [];
}

export const statusLabels: Record<OperatorStatus, string> = {
  LEAD: "Em negociação", CONTRACTED: "Contratado", ONBOARDING: "Em configuração", DOCS_PENDING: "Documentos pendentes",
  UNDER_REVIEW: "Em análise", APPROVED: "Aprovado", GENERATING: "A preparar ambiente", ASSISTANT_TRAINING: "A configurar assistente",
  SANDBOX: "Em testes", CLIENT_REVIEW: "Validação do cliente", LIVE: "Em produção", RESTRICTED: "Restrito", SUSPENDED: "Suspenso",
};
