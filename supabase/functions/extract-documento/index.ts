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
        "Só preencha este campo numa nota de SERVIÇO (NFS-e/DANFSe): 'VALOR TOTAL DA NFS-e'/'Valor da Operação/Serviço'. " +
        "Numa nota de PRODUTO (DANFE), NÃO preencha este campo — use valor_total_nota_impresso em vez dele. Apenas números, " +
        "sem 'R$' e sem separador de milhar. Omita se não conseguir ler com confiança.",
    },
    valor_total_nota_impresso: {
      type: "number",
      description:
        "Nota de PRODUTO (DANFE) apenas: cópia LITERAL do número impresso no campo 'VALOR TOTAL DA NOTA' (a última caixa da " +
        "seção 'Cálculo do Imposto', normalmente logo ABAIXO de 'VALOR TOTAL DOS PRODUTOS') — este é o valor final que " +
        "realmente será cobrado, já considerando qualquer desconto/acréscimo que se aplique (às vezes é igual ao 'VALOR " +
        "TOTAL DOS PRODUTOS', às vezes é menor — não presuma, copie o que está impresso nessa caixa específica). CUIDADO: " +
        "'VALOR TOTAL DOS PRODUTOS' fica bem perto e é parecido, mas é um campo DIFERENTE — não copie o valor de um pro " +
        "outro. Omita numa nota de SERVIÇO (use valor_total) ou se não conseguir ler essa caixa com confiança.",
    },
    valor_produtos: {
      type: "number",
      description:
        "Nota de PRODUTO (DANFE) apenas: valor do campo 'VALOR TOTAL DOS PRODUTOS' (seção 'Cálculo do Imposto') — cópia " +
        "literal do número impresso, sem fazer conta. Serve só de reserva pro caso de não dar pra ler " +
        "valor_total_nota_impresso — não é ele que decide o valor final. Omita numa nota de SERVIÇO.",
    },
    desconto: {
      type: "number",
      description:
        "Nota de PRODUTO (DANFE) apenas: valor do campo 'DESCONTO' (seção 'Cálculo do Imposto', perto de 'VALOR TOTAL DOS " +
        "PRODUTOS') — cópia literal do número impresso, sem fazer conta. Serve só de reserva (junto com valor_produtos) pro " +
        "caso de não dar pra ler valor_total_nota_impresso. Omita se o campo não existir ou estiver zerado/em branco.",
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
        "CNPJ de quem RECEBE a mercadoria/serviço. Vá direto no quadro rotulado 'DESTINATÁRIO' ou 'DESTINATÁRIO/REMETENTE' " +
        "(numa nota de produto/DANFE) ou 'TOMADOR'/'ADQUIRENTE' (numa nota de SERVIÇO) — o CNPJ certo é o que está DENTRO " +
        "desse quadro, do lado do nome/razão social de quem recebe. NUNCA o CNPJ de quem emitiu a nota (o " +
        "fornecedor/emitente/prestador) — e cuidado: o CNPJ do EMITENTE às vezes aparece IMPRESSO DE NOVO longe do quadro " +
        "'Emitente' original, perto do código de barras/chave de acesso/protocolo de autorização (rodapé ou lateral da " +
        "nota) — não confunda esse com o do destinatário só por estar fisicamente perto de outros números da nota. Se tiver " +
        "mais de um CNPJ candidato e não der pra confirmar com certeza qual está dentro do quadro do destinatário, omita em " +
        "vez de arriscar o CNPJ errado.",
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
  "VALOR TOTAL — cuidado especial aqui, é a maior fonte de erro: numa nota de PRODUTO (DANFE) NÃO preencha o campo " +
  "valor_total — em vez disso copie valor_total_nota_impresso diretamente do campo 'VALOR TOTAL DA NOTA' (a última caixa " +
  "da seção 'Cálculo do Imposto'). Esse campo fica bem perto de 'VALOR TOTAL DOS PRODUTOS' (um pouco acima) e os dois são " +
  "fáceis de confundir — são frequentemente IGUAIS (quando não há desconto real aplicado no total, mesmo que exista um " +
  "campo 'DESCONTO' preenchido do lado — nem todo desconto impresso é realmente abatido do total, então NÃO assuma que " +
  "'VALOR TOTAL DA NOTA' é sempre menor), mas leia cada um da sua própria caixa, nunca copie o número de um campo pro " +
  "outro por parecerem relacionados. Só se a caixa 'VALOR TOTAL DA NOTA' estiver ilegível, preencha valor_produtos e " +
  "desconto (cópia literal de cada um) como alternativa. Numa nota de SERVIÇO (sem essa seção), preencha valor_total " +
  "diretamente com 'VALOR TOTAL DA NFS-e'/'Valor da Operação/Serviço', e omita valor_total_nota_impresso/valor_produtos/" +
  "desconto.\n\n" +
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

    // Cache de prompt: a instrução + o schema são IDÊNTICOS em toda leitura
    // do mesmo tipo (pedido ou nota) — só o arquivo muda a cada chamada. Sem
    // cache, esse texto é recobrado a preço cheio toda vez; com cache, só a
    // primeira chamada de uma leva paga cheio, as próximas (dentro de ~5min,
    // ex: o robô processando vários pedidos seguidos) pagam 10% dessa parte.
    // Reforça o schema como TEXTO aqui (além de já ir estruturado no
    // output_config, que continua garantindo o formato da resposta) só pra
    // esse bloco ficar grande o bastante pra valer cache — texto curto demais
    // não ativa. Importante: o texto cacheável (estável) precisa vir ANTES
    // do arquivo (que muda sempre) pra fazer parte do "prefixo" cacheado.
    const instrucoesCacheaveis =
      `${prompt}\n\n` +
      "Formato esperado da resposta (sua resposta final é validada contra este schema — isso aqui é só contexto extra " +
      "antes de ler o documento):\n" +
      JSON.stringify(schema);

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
            content: [
              { type: "text", text: instrucoesCacheaveis, cache_control: { type: "ephemeral" } },
              fileBlock,
            ],
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
      // "|| (...)" (não "?? (...)") de propósito, nos dois níveis abaixo —
      // alguns documentos não têm coluna de total por linha nem um "Total das
      // Mercadorias" de verdade, e a IA às vezes copia um "0,00" literal do
      // documento em vez de omitir o campo nesse caso. Nem uma linha de item
      // nem um pedido inteiro têm valor 0 de verdade, então tratamos 0 igual
      // a "não veio" e caímos pro fallback (quantidade×valor unitário, depois
      // soma dos itens) — sem isso, o pedido salvava com valor zerado (ou até
      // negativo, se tinha desconto).
      const somaItens = Array.isArray(extraido.itens)
        ? extraido.itens.reduce((soma: number, item: { valor_total?: number; quantidade?: number; valor_unitario?: number }) => {
            const linha = item.valor_total || (item.quantidade != null && item.valor_unitario != null ? item.quantidade * item.valor_unitario : 0);
            return soma + (linha || 0);
          }, 0)
        : null;
      const mercadorias = extraido.total_mercadorias || somaItens;
      if (mercadorias != null) {
        extraido.valor_total = mercadorias + (extraido.frete || 0) + (extraido.despesas || 0) - (extraido.descontos || 0);
      }
    }

    // Nota de PRODUTO: prioriza o valor que a IA leu DIRETO do campo "VALOR
    // TOTAL DA NOTA" (valor_total_nota_impresso) — é o número que realmente
    // vale, então confiamos nele em vez de recalcular por cima. "VALOR TOTAL
    // DOS PRODUTOS" e "DESCONTO" às vezes já foram usados aqui como se
    // "total = produtos - desconto" fosse sempre verdade, mas achamos um
    // caso real (pedido S51444) em que a nota tinha um campo "DESCONTO"
    // preenchido (R$40,92) e mesmo assim "VALOR TOTAL DA NOTA" saiu igual a
    // "VALOR TOTAL DOS PRODUTOS" (R$372,00 os dois) — ou seja, esse desconto
    // não se aplicava ao total final daquela nota. Calcular por cima teria
    // dado R$331,08, errado. Por isso agora só caímos pro cálculo
    // (produtos - desconto) quando a IA não conseguiu ler a caixa "VALOR
    // TOTAL DA NOTA" com confiança.
    if (tipo === "nota") {
      if (extraido.valor_total_nota_impresso != null) {
        extraido.valor_total = extraido.valor_total_nota_impresso;
      } else {
        const somaItensNota = Array.isArray(extraido.itens)
          ? extraido.itens.reduce((soma: number, item: { valor_total?: number; quantidade?: number; valor_unitario?: number }) => {
              const linha = item.valor_total || (item.quantidade != null && item.valor_unitario != null ? item.quantidade * item.valor_unitario : 0);
              return soma + (linha || 0);
            }, 0)
          : null;
        const produtos = extraido.valor_produtos || somaItensNota;
        if (produtos != null) {
          extraido.valor_total = produtos - (extraido.desconto || 0);
        }
        // Sem valor_total_nota_impresso, valor_produtos nem itens (ex: nota
        // de serviço) — mantém o valor_total que a IA já leu direto do
        // documento.
      }
    }

    // "usage" vai junto só pra dar pra acompanhar o efeito do cache de prompt
    // (cache_read_input_tokens/cache_creation_input_tokens) sem precisar
    // abrir o painel da Anthropic — o app não usa esse campo pra nada.
    return jsonResponse({ data: extraido, usage: data.usage }, 200);
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
