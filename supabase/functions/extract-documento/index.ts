// Edge Function: extract-documento
//
// Recebe um arquivo (PDF ou foto) em base64 e usa a API da Anthropic
// (Claude Sonnet 5) pra extrair dados — de um pedido de compra ou de uma
// nota fiscal, dependendo do campo "tipo". Roda no servidor pra manter a
// chave da API da Anthropic secreta (mesma chave já configurada no projeto
// Supabase pro Edge Function "extract-pedido" do app Avanço para Contratos —
// não precisa configurar de novo).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA_PEDIDO = {
  type: "object",
  properties: {
    empresa_compradora_nome: {
      type: "string",
      description:
        "Nome/razão social da empresa COMPRADORA — a que está EMITINDO este pedido de compra (dona do sistema/pedido). " +
        "NUNCA o fornecedor/vendedor (que fica na seção 'Dados do Fornecedor'). Normalmente NÃO tem um rótulo explícito — é a " +
        "empresa do CABEÇALHO/TIMBRE no topo do documento (costuma ter um logotipo ao lado). Às vezes também aparece com um " +
        "rótulo 'Empresa:'. NÃO confunda com o campo 'Comprador:', que é o nome de uma PESSOA (veja solicitante_nome), não da empresa.",
    },
    empresa_compradora_cnpj: {
      type: "string",
      description:
        "CNPJ da empresa COMPRADORA (a mesma do campo acima, do cabeçalho/timbre), não o do fornecedor. O documento tem pelo menos " +
        "dois CNPJs — confirme pelo contexto ao redor (nome da empresa, endereço) a qual das duas empresas cada um pertence antes " +
        "de escolher.",
    },
    numero_pedido: {
      type: "string",
      description:
        "Número/código identificador deste pedido de compra. Costuma aparecer perto de rótulos como 'Nº Pedido', 'Pedido de " +
        "Compras Nº', 'Nº do Pedido' ou 'Pedido Nº', geralmente no topo do documento. Omita se não encontrar.",
    },
    valor_total: {
      type: "number",
      description:
        "Valor TOTAL GERAL do pedido em R$ — o valor final que efetivamente será cobrado/faturado (o que deve bater com o valor " +
        "total da nota fiscal correspondente). Se o documento mostrar mais de um total (ex: 'Total das Mercadorias', 'Total com " +
        "Impostos', 'Total Geral'), use sempre o 'Total Geral' (ou equivalente: o maior/último total, que soma mercadorias + " +
        "impostos + frete - descontos) — NUNCA o total só das mercadorias quando houver um total geral maior disponível. Se não " +
        "houver nenhum total explícito, some os itens. Apenas números, sem 'R$' e sem separador de milhar (ex: 45390.00). Omita " +
        "se não conseguir determinar com confiança.",
    },
    solicitante_nome: {
      type: "string",
      description:
        "Nome da PESSOA que fez/solicitou o pedido (um nome de pessoa física, não de empresa) — costuma aparecer perto de rótulos " +
        "como 'Comprador:', 'Solicitante:', 'Requisitante:' na seção de informações adicionais do pedido (não confundir com nomes " +
        "que aparecem apenas na lista de 'Aprovações/Aprovadores', que não são o solicitante). Omita se não houver um nome de " +
        "pessoa identificável.",
    },
    local_retirada: {
      type: "string",
      description:
        "Local/endereço/cidade onde a mercadoria deve ser retirada ou entregue. Costuma aparecer com o rótulo 'Local de Entrega:' " +
        "na seção de informações adicionais — use esse endereço quando existir. Na falta dele, use a cidade do fornecedor. Omita " +
        "se não houver essa informação.",
    },
    frete_fob: {
      type: "boolean",
      description:
        "true se a palavra 'FOB' aparecer em QUALQUER lugar do documento (mais comum dentro do campo 'Observações', mas pode " +
        "estar em outro lugar) — sigla que indica que o COMPRADOR (não o fornecedor) é responsável por buscar/transportar a " +
        "mercadoria, ou seja, este pedido PRECISA entrar numa rota de coleta. false se a palavra 'FOB' não aparecer em lugar " +
        "nenhum do documento (nesse caso, por padrão, entende-se que o frete é por conta do fornecedor — CIF — e o pedido não " +
        "precisa de coleta).",
    },
  },
  required: ["empresa_compradora_nome", "frete_fob"],
  additionalProperties: false,
};

const SCHEMA_NOTA = {
  type: "object",
  properties: {
    numero_nota: {
      type: "string",
      description: "Número da nota fiscal. Omita se não conseguir ler com clareza.",
    },
    valor_total: {
      type: "number",
      description:
        "Valor total da nota fiscal (campo 'VALOR TOTAL DA NOTA' ou 'VALOR TOTAL DA NF-e'). Apenas números, sem 'R$' e sem separador " +
        "de milhar (ex: 45390.00). Omita se não conseguir ler com confiança.",
    },
    destinatario_nome: {
      type: "string",
      description: "Nome/razão social do DESTINATÁRIO da nota fiscal (quem está recebendo a mercadoria, não quem emitiu).",
    },
    destinatario_cnpj: {
      type: "string",
      description:
        "CNPJ do DESTINATÁRIO da nota fiscal (quem recebe a mercadoria) — NUNCA o CNPJ de quem emitiu a nota (o fornecedor/emitente). " +
        "A nota tem dois CNPJs; confirme pelo rótulo 'Destinatário'/'Remetente' ou 'Emitente'/'Destinatário' ao redor de cada um antes " +
        "de escolher. Se a foto estiver ruim e não der pra ter certeza, omita em vez de arriscar o CNPJ errado.",
    },
    emitente_nome: {
      type: "string",
      description: "Nome/razão social de quem EMITIU a nota fiscal (o fornecedor/vendedor).",
    },
  },
  required: [],
  additionalProperties: false,
};

const PROMPT_PEDIDO =
  "Extraia os dados deste pedido de compra. Preste atenção especial a estes pontos:\n\n" +
  "1) EMPRESA COMPRADORA: normalmente não tem rótulo explícito — é a empresa do cabeçalho/timbre no topo do documento (às " +
  "vezes com logotipo), diferente da empresa listada em 'Dados do Fornecedor'. Nunca confunda com o campo 'Comprador:', que " +
  "é uma PESSOA, não a empresa.\n\n" +
  "2) VALOR TOTAL: se houver mais de um total no documento (ex: total só das mercadorias, total de impostos, total geral), " +
  "extraia sempre o TOTAL GERAL/FINAL (o maior, que soma tudo) — é esse valor que deve bater com o valor total de uma nota " +
  "fiscal emitida pra este pedido, não o total parcial das mercadorias.\n\n" +
  "3) SOLICITANTE: procure o nome de pessoa no campo 'Comprador:'/'Solicitante:'/'Requisitante:' da seção de informações do " +
  "pedido — não confunda com os nomes que aparecem numa eventual lista de aprovadores/aprovações, que não são o solicitante.\n\n" +
  "4) LOCAL: procure o endereço em 'Local de Entrega:', se houver.\n\n" +
  "5) FOB: procure a palavra 'FOB' em QUALQUER lugar do texto do documento (mais comum no campo 'Observações', mas pode " +
  "estar em outro lugar) — não é um rótulo de campo, é só uma palavra solta que pode ou não aparecer em algum ponto do " +
  "documento. Retorne frete_fob=true só se a palavra aparecer literalmente; caso contrário, frete_fob=false.\n\n" +
  "6) Leia os números (CNPJ, valores) com cuidado, dígito por dígito, sem inventar ou aproximar.";

const PROMPT_NOTA =
  "Extraia os dados desta nota fiscal (foto ou digitalização de um DANFE). Preste atenção especial: a nota tem duas " +
  "empresas — EMITENTE (quem vendeu/emitiu) e DESTINATÁRIO (quem recebe a mercadoria). O CNPJ e nome do destinatário " +
  "são os mais importantes de extrair corretamente, não confunda com o do emitente. A foto pode ter qualidade ruim, " +
  "reflexo ou estar levemente torta — leia com cuidado; se algum campo não estiver legível com confiança, omita-o em " +
  "vez de arriscar um valor errado.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { tipo, file_base64, media_type } = await req.json();
    if (!file_base64 || typeof file_base64 !== "string") {
      return jsonResponse({ error: "Campo file_base64 ausente ou inválido." }, 400);
    }
    if (tipo !== "pedido" && tipo !== "nota") {
      return jsonResponse({ error: "Campo tipo deve ser 'pedido' ou 'nota'." }, 400);
    }
    const mediaType = typeof media_type === "string" && media_type ? media_type : "application/pdf";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY não configurada no servidor." }, 500);
    }

    const isImage = mediaType.startsWith("image/");
    const fileBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: file_base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } };

    const schema = tipo === "pedido" ? SCHEMA_PEDIDO : SCHEMA_NOTA;
    const prompt = tipo === "pedido" ? PROMPT_PEDIDO : PROMPT_NOTA;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        output_config: { format: { type: "json_schema", schema } },
        messages: [
          {
            role: "user",
            content: [fileBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return jsonResponse({ error: data?.error?.message || "Erro ao chamar a API da Anthropic." }, 502);
    }

    if (data.stop_reason === "refusal") {
      return jsonResponse({ error: "O modelo recusou processar este documento." }, 422);
    }

    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    if (!textBlock) {
      return jsonResponse({ error: "Resposta inesperada do modelo (sem texto)." }, 502);
    }

    const extraido = JSON.parse(textBlock.text);
    return jsonResponse({ data: extraido }, 200);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Erro desconhecido." }, 500);
  }
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
