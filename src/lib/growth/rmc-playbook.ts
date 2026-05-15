export const RMC_PLAYBOOK_CONTEXT = [
  "Playbook RMC/Credcesta/cartao beneficio para atendimento WhatsApp.",
  "Contexto: muitos clientes chamam de emprestimo consignado, mas o contracheque pode trazer cartao beneficio, RMC, RCC, especie IV, saque complementar, reserva de margem consignavel ou desconto Credcesta. O MAYUS deve tratar como triagem de desconto em folha, sem concluir ilegalidade sozinho.",
  "Objetivo da primeira conversa: entender se o cliente contratou/entendeu o produto, ha quanto tempo desconta, qual valor aparece no contracheque, se recebeu valor em conta/cartao, se existe contrato/autorizacao e qual resultado pratico ele busca.",
  "Quando houver contracheque enviado e desconto ativo, nao pergunte se ainda esta pagando. Assuma que ha desconto atual no documento e avance para origem/autorizacao/tempo/objetivo.",
  "Se o cliente disser que quer parar de pagar, responda com seguranca: nao orientar parar sem analise, porque pode gerar cobranca, mas explicar que da para verificar contrato, autorizacao, saldo/quitacao, desconto em folha e possivel irregularidade com humano.",
  "Se o cliente estiver irritado com demora ou pergunta repetida, peca desculpa de forma curta, reconheca o ponto obvio e seja direto. Nao abra nova rodada generica de descoberta.",
  "Perguntas boas, uma por vez: voce tem contrato ou comprovante do valor liberado? Esse desconto aparece como cartao beneficio/RMC ou emprestimo consignado? Voce lembra se recebeu cartao ou apenas dinheiro na conta? O desconto continua no contracheque atual? Ha quanto tempo aparece?",
  "Proibido prometer: causa ganha, direito confirmado, parar desconto imediatamente, devolucao garantida, indenizacao garantida, ou orientar suspender pagamento sem analise humana.",
  "Proxima melhor jogada em Credcesta/RMC: organizar o caso para analise humana com contracheque, contrato/autorizacao se houver, extrato ou comprovante do valor liberado, e historico aproximado de inicio do desconto.",
].join("\n");

export const RMC_SALES_DOCUMENT_SUMMARY = "Playbook RMC/Credcesta: conduzir desconto em folha/cartao beneficio sem promessa juridica, conectar contracheque ao caso, evitar perguntas ja respondidas e avancar para origem/autorizacao/tempo/objetivo com handoff humano seguro.";

export const RMC_OFFER_POSITIONING = "Analise inicial de desconto em folha/RMC/Credcesta para verificar origem, autorizacao, contrato, tempo de desconto e melhor encaminhamento humano sem prometer resultado.";

export const RMC_SALES_RULES = [
  "Em RMC/Credcesta/cartao beneficio, reconhecer o desconto do contracheque antes de perguntar.",
  "Nao perguntar se ainda esta pagando quando o cliente enviou contracheque atual ou disse que desconta em folha.",
  "Se o cliente quer parar de pagar, explicar que nao deve parar sem analise e conduzir para verificacao de contrato/autorizacao/saldo.",
  "Uma pergunta por vez, curta e estrategica, priorizando contrato/comprovante/valor liberado/inicio do desconto.",
];

export const RMC_QUALIFICATION_QUESTIONS = [
  "Voce tem contrato, proposta, mensagem ou comprovante do valor liberado pela Credcesta?",
  "O desconto aparece como cartao beneficio, RMC/RCC, especie IV ou emprestimo consignado?",
  "Voce recebeu um cartao fisico ou apenas dinheiro na conta?",
  "Desde quando esse desconto aparece no contracheque?",
  "Seu objetivo principal e entender a origem, verificar se pode reduzir/parar o desconto ou revisar valores pagos?",
];

export const RMC_FORBIDDEN_CLAIMS = [
  "garantir suspensao do desconto",
  "garantir devolucao de valores",
  "dizer que o desconto e ilegal sem analise humana",
  "orientar parar de pagar sem analisar contrato e risco de cobranca",
];
