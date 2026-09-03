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
    total_mercadorias: {
      type: "number",
      description:
        "Valor do campo 'Total das Mercadorias' da seção 'Totais' (valor SEM imposto) — cópia literal do número impresso, " +
        "sem fazer nenhuma conta. Se não existir esse campo explícito, some o valor_total de cada item em vez dele. Apenas " +
        "números, sem 'R$' e sem separador de milhar. Omita se não conseguir determinar com confiança.",
    },
    frete: {
      type: "number",
      description: "Valor do campo 'Frete' da seção 'Totais', cópia literal do número impresso. Omita se não houver esse campo.",
    },
    despesas: {
      type: "number",
      description: "Valor do campo 'Despesas' da seção 'Totais', cópia literal do número impresso. Omita se não houver esse campo.",
    },
    descontos: {
      type: "number",
      description: "Valor do campo 'Descontos' da seção 'Totais', cópia literal do número impresso. Omita se não houver esse campo.",
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
        "Endereço onde o MOTORISTA deve ir buscar a mercadoria — ou seja, o endereço do FORNECEDOR (a empresa que está vendendo, " +
        "na seção 'Dados do Fornecedor': Endereço, Bairro, Município, Estado, CEP), não o do comprador. NUNCA use o campo 'Local " +
        "de Entrega:' pra este dado — em documentos deste tipo esse campo mostra o endereço da própria empresa COMPRADORA (pra " +
        "onde a mercadoria vai depois, não de onde ela sai), o que serviria pra entrega, não pra coleta. Monte o endereço juntando " +
        "Endereço + Bairro + Município + Estado + CEP do fornecedor num texto só. Omita se não houver esses dados do fornecedor.",
    },
    fornecedor_nome: {
      type: "string",
      description:
        "Nome/razão social da empresa VENDEDORA — o FORNECEDOR que está vendendo a mercadoria (seção 'Dados do Fornecedor'), " +
        "nunca a empresa compradora do cabeçalho/timbre. Omita se não conseguir identificar com confiança.",
    },
    condicao_pagamento_codigo: {
      type: "string",
      description:
        "Código da condição de pagamento — número (geralmente com 3 dígitos, ex: '038') que aparece perto do rótulo " +
        "'Condições de Pagamento:' na seção 'Informações Adicionais'. Copie exatamente os dígitos impressos, sem adicionar " +
        "nem remover zeros à esquerda. Omita se não encontrar esse campo.",
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
    itens: {
      type: "array",
      description: "Cada linha de item/produto da tabela do pedido — inclua TODAS as linhas, mesmo que sejam muitas.",
      items: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome/descrição do produto ou item." },
          quantidade: { type: "number", description: "Quantidade numérica do item." },
          unidade: { type: "string", description: "Unidade de medida (ex: KG, UN, SC, L), se houver." },
          valor_unitario: {
            type: "number",
            description:
              "Valor unitário em R$ desta linha (coluna 'Vlr. Unitário' ou equivalente). Apenas números, sem 'R$' e sem " +
              "separador de milhar. Omita se não houver essa coluna.",
          },
          valor_total: {
            type: "number",
            description: "Valor total desta linha (quantidade × valor unitário), se houver essa coluna. Omita se não houver.",
          },
        },
        required: ["produto_nome", "quantidade"],
        additionalProperties: false,
      },
    },
  },
  required: ["empresa_compradora_nome", "frete_fob"],
  additionalProperties: false,
};

const SCHEMA_NOTA = {
  type: "object",
  properties: {
    tipo_documento: {
      type: "string",
      enum: ["produto", "servico"],
      description:
        "'produto' se for uma nota fiscal de PRODUTO/mercadoria (DANFE, com tabela de itens). 'servico' se for uma nota " +
        "fiscal de SERVIÇO (NFS-e/DANFSe, 'Documento Auxiliar da NFS-e', com um campo 'Descrição do Serviço' em vez de " +
        "tabela de itens).",
    },
    numero_nota: {
      type: "string",
      description: "Número da nota fiscal. Omita se não conseguir ler com clareza.",
    },
    valor_total: {
      type: "number",
      description:
        "Valor total da nota — campo 'VALOR TOTAL DA NOTA'/'VALOR TOTAL DA NF-e' numa nota de produto (DANFE), ou 'VALOR TOTAL " +
        "DA NFS-e'/'Valor da Operação/Serviço' numa nota de SERVIÇO (NFS-e/DANFSe). Apenas números, sem 'R$' e sem separador " +
        "de milhar (ex: 45390.00). Omita se não conseguir ler com confiança.",
    },
    destinatario_nome: {
      type: "string",
      description:
        "Nome/razão social de quem está RECEBENDO a mercadoria/serviço — o campo 'Destinatário' numa nota de produto (DANFE), " +
        "ou o campo 'Tomador'/'Adquirente' numa nota de SERVIÇO (NFS-e/DANFSe). Nunca quem emitiu.",
    },
    destinatario_cnpj: {
      type: "string",
      description:
        "CNPJ de quem RECEBE a mercadoria/serviço — o 'Destinatário' numa nota de produto (DANFE), ou o 'Tomador'/'Adquirente' " +
        "numa nota de SERVIÇO (NFS-e/DANFSe). NUNCA o CNPJ de quem emitiu a nota (o fornecedor/emitente/prestador). A nota tem " +
        "dois CNPJs; confirme pelo rótulo ao redor de cada um antes de escolher. Se a foto estiver ruim e não der pra ter " +
        "certeza, omita em vez de arriscar o CNPJ errado.",
    },
    emitente_nome: {
      type: "string",
      description:
        "Nome/razão social de quem EMITIU a nota — o 'Emitente' numa nota de produto (DANFE), ou o 'Prestador'/'Fornecedor' " +
        "numa nota de SERVIÇO (NFS-e/DANFSe).",
    },
    data_emissao: {
      type: "string",
      description:
        "Data de emissão da nota (campo 'Data da Emissão' ou 'DATA DA EMISSÃO'). Formato AAAA-MM-DD (ex: 2026-09-02). Omita " +
        "se não conseguir ler com confiança.",
    },
    parcelas_pagamento: {
      type: "array",
      description:
        "Cada parcela/duplicata da seção 'Fatura/Duplicata' (ou 'Cálculo de Imposto'/rodapé equivalente) — ex: 'A PRAZO 30 " +
        "DIAS --> 1: 02/10/2026 - R$ 104,00' vira uma parcela com essa data e valor. Se a nota for à vista ou não tiver essa " +
        "seção, omita o campo inteiro (não invente uma parcela).",
      items: {
        type: "object",
        properties: {
          data_vencimento: { type: "string", description: "Data de vencimento desta parcela, formato AAAA-MM-DD." },
          valor: { type: "number", description: "Valor desta parcela em R$, apenas números." },
        },
        required: ["data_vencimento"],
        additionalProperties: false,
      },
    },
    itens: {
      type: "array",
      description:
        "Cada linha de item/produto da tabela de itens da nota (nota de produto/DANFE) — inclua TODAS as linhas. Se for uma " +
        "nota de SERVIÇO (NFS-e/DANFSe, sem tabela de itens), crie UM único item usando a 'Descrição do Serviço' como " +
        "produto_nome, quantidade 1 e valor_total igual ao valor total da nota.",
      items: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome/descrição do produto ou item." },
          quantidade: { type: "number", description: "Quantidade numérica do item (coluna QTDE ou similar)." },
          unidade: { type: "string", description: "Unidade de medida (ex: KG, UN, SC, L), se houver." },
          valor_unitario: {
            type: "number",
            description:
              "Valor unitário em R$ desta linha (coluna 'VALOR UNIT' ou similar). Apenas números, sem 'R$' e sem separador " +
              "de milhar. Omita se não houver essa coluna.",
          },
          valor_total: {
            type: "number",
            description: "Valor total desta linha, se houver essa coluna. Omita se não houver.",
          },
        },
        required: ["produto_nome", "quantidade"],
        additionalProperties: false,
      },
    },
  },
  required: ["tipo_documento"],
  additionalProperties: false,
};

const PROMPT_PEDIDO =
  "Extraia os dados deste pedido de compra. Preste atenção especial a estes pontos:\n\n" +
  "1) EMPRESA COMPRADORA: normalmente não tem rótulo explícito — é a empresa do cabeçalho/timbre no topo do documento (às " +
  "vezes com logotipo), diferente da empresa listada em 'Dados do Fornecedor'. Nunca confunda com o campo 'Comprador:', que " +
  "é uma PESSOA, não a empresa.\n\n" +
  "2) VALORES DA SEÇÃO 'TOTAIS': extraia total_mercadorias, frete, despesas e descontos como CÓPIA LITERAL dos números " +
  "impressos — não some nem subtraia nada, isso é calculado depois. NUNCA copie 'ICMS', 'IPI', 'Seguro', 'Total com " +
  "Impostos' ou 'Total Geral' pra esses campos — o cálculo de imposto deste ERP está incorreto, então esses valores não " +
  "servem.\n\n" +
  "3) SOLICITANTE: procure o nome de pessoa no campo 'Comprador:'/'Solicitante:'/'Requisitante:' da seção de informações do " +
  "pedido — não confunda com os nomes que aparecem numa eventual lista de aprovadores/aprovações, que não são o solicitante.\n\n" +
  "4) LOCAL DE RETIRADA: use o endereço do FORNECEDOR (seção 'Dados do Fornecedor': Endereço, Bairro, Município, Estado, CEP) — " +
  "é lá que o motorista vai buscar a mercadoria. NUNCA use o campo 'Local de Entrega:', que é o endereço da empresa " +
  "COMPRADORA (pra onde a mercadoria vai depois), não de onde ela sai.\n\n" +
  "4b) EMPRESA VENDEDORA: extraia também o nome/razão social do FORNECEDOR (seção 'Dados do Fornecedor'), separado do nome " +
  "da empresa compradora.\n\n" +
  "5) FOB: procure a palavra 'FOB' em QUALQUER lugar do texto do documento (mais comum no campo 'Observações', mas pode " +
  "estar em outro lugar) — não é um rótulo de campo, é só uma palavra solta que pode ou não aparecer em algum ponto do " +
  "documento. Retorne frete_fob=true só se a palavra aparecer literalmente; caso contrário, frete_fob=false.\n\n" +
  "6) ITENS: extraia cada linha da tabela de itens (produto, quantidade, valor unitário) — não misture o valor/quantidade " +
  "de uma linha com o de outra linha vizinha.\n\n" +
  "7) CONDIÇÃO DE PAGAMENTO: copie o código numérico do campo 'Condições de Pagamento:' (seção 'Informações Adicionais'), " +
  "exatamente como impresso (com os zeros à esquerda, se houver).\n\n" +
  "8) Leia os números (CNPJ, valores) com cuidado, dígito por dígito, sem inventar ou aproximar.";

const PROMPT_NOTA =
  "Extraia os dados desta nota fiscal. Pode ser uma nota de PRODUTO (DANFE) ou uma nota de SERVIÇO (NFS-e/DANFSe, " +
  "'Documento Auxiliar da NFS-e') — identifique qual é pelo cabeçalho do documento antes de extrair, porque os rótulos " +
  "dos campos mudam entre as duas:\n\n" +
  "- Nota de PRODUTO (DANFE): EMITENTE (quem vendeu) e DESTINATÁRIO (quem recebe a mercadoria); tabela de itens com " +
  "produto/quantidade/valor unitário.\n" +
  "- Nota de SERVIÇO (NFS-e/DANFSe): PRESTADOR/FORNECEDOR (quem prestou o serviço, equivale ao emitente) e " +
  "TOMADOR/ADQUIRENTE (quem contratou o serviço, equivale ao destinatário); não tem tabela de itens — em vez disso tem " +
  "um campo 'Descrição do Serviço' (texto corrido) e um 'VALOR TOTAL DA NFS-e'/'Valor da Operação/Serviço'. Nesse caso, " +
  "monte um único item em itens[] usando essa descrição como produto_nome, quantidade 1 e valor_total = valor total da nota.\n\n" +
  "Em qualquer um dos dois casos: o CNPJ e nome de quem RECEBE (destinatário/tomador) são os mais importantes de extrair " +
  "corretamente, não confunda com o de quem emitiu/prestou. A foto pode ter qualidade ruim, reflexo ou estar levemente " +
  "torta — leia com cuidado; se algum campo não estiver legível com confiança, omita-o em vez de arriscar um valor errado.\n\n" +
  "Extraia também a DATA DE EMISSÃO da nota, e cada parcela/duplicata de pagamento (data de vencimento e valor) da seção " +
  "'Fatura/Duplicata' ou equivalente — usadas depois pra conferir se o prazo de pagamento bate com a condição combinada no " +
  "pedido. Se a nota for à vista ou não tiver essa seção, não invente uma parcela.";

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

    // O total é calculado aqui, não pelo modelo — pedir pra IA somar/subtrair
    // campos espalhados no documento (mercadorias + frete + despesas -
    // descontos) já se mostrou pouco confiável (ela às vezes ignora o
    // desconto). O modelo só extrai os números crus; a conta é determinística.
    if (tipo === "pedido") {
      const somaItens = Array.isArray(extraido.itens)
        ? extraido.itens.reduce((soma: number, item: { valor_total?: number; quantidade?: number; valor_unitario?: number }) => {
            const linha = item.valor_total ?? (item.quantidade != null && item.valor_unitario != null ? item.quantidade * item.valor_unitario : 0);
            return soma + (linha || 0);
          }, 0)
        : null;
      const mercadorias = extraido.total_mercadorias ?? somaItens;
      if (mercadorias != null) {
        extraido.valor_total = mercadorias + (extraido.frete || 0) + (extraido.despesas || 0) - (extraido.descontos || 0);
      }
    }

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
