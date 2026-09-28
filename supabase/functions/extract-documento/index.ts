// Edge Function: extract-documento
//
// Recebe um arquivo (PDF ou foto) em base64 e usa a API da Anthropic
// (Claude Sonnet 5) pra extrair dados â€” de um pedido de compra ou de uma
// nota fiscal, dependendo do campo "tipo". Roda no servidor pra manter a
// chave da API da Anthropic secreta (mesma chave jÃ¡ configurada no projeto
// Supabase pro Edge Function "extract-pedido" do app AvanÃ§o para Contratos â€”
// nÃ£o precisa configurar de novo).

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
        "Nome/razÃ£o social da empresa COMPRADORA â€” a que estÃ¡ EMITINDO este pedido de compra (dona do sistema/pedido). " +
        "NUNCA o fornecedor/vendedor (que fica na seÃ§Ã£o 'Dados do Fornecedor'). Normalmente NÃƒO tem um rÃ³tulo explÃ­cito â€” Ã© a " +
        "empresa do CABEÃ‡ALHO/TIMBRE no topo do documento (costuma ter um logotipo ao lado). Ã€s vezes tambÃ©m aparece com um " +
        "rÃ³tulo 'Empresa:'. NÃƒO confunda com o campo 'Comprador:', que Ã© o nome de uma PESSOA (veja solicitante_nome), nÃ£o da empresa.",
    },
    empresa_compradora_cnpj: {
      type: "string",
      description:
        "CNPJ da empresa COMPRADORA (a mesma do campo acima, do cabeÃ§alho/timbre), nÃ£o o do fornecedor. O documento tem pelo menos " +
        "dois CNPJs â€” confirme pelo contexto ao redor (nome da empresa, endereÃ§o) a qual das duas empresas cada um pertence antes " +
        "de escolher.",
    },
    numero_pedido: {
      type: "string",
      description:
        "NÃºmero/cÃ³digo identificador deste pedido de compra. Costuma aparecer perto de rÃ³tulos como 'NÂº Pedido', 'Pedido de " +
        "Compras NÂº', 'NÂº do Pedido' ou 'Pedido NÂº', geralmente no topo do documento. Omita se nÃ£o encontrar.",
    },
    total_mercadorias: {
      type: "number",
      description:
        "Valor do campo 'Total das Mercadorias' da seÃ§Ã£o 'Totais' (valor SEM imposto) â€” cÃ³pia literal do nÃºmero impresso, " +
        "sem fazer nenhuma conta. Se nÃ£o existir esse campo explÃ­cito, some o valor_total de cada item em vez dele. Apenas " +
        "nÃºmeros, sem 'R$' e sem separador de milhar. Omita se nÃ£o conseguir determinar com confianÃ§a.",
    },
    frete: {
      type: "number",
      description: "Valor do campo 'Frete' da seÃ§Ã£o 'Totais', cÃ³pia literal do nÃºmero impresso. Omita se nÃ£o houver esse campo.",
    },
    despesas: {
      type: "number",
      description: "Valor do campo 'Despesas' da seÃ§Ã£o 'Totais', cÃ³pia literal do nÃºmero impresso. Omita se nÃ£o houver esse campo.",
    },
    descontos: {
      type: "number",
      description: "Valor do campo 'Descontos' da seÃ§Ã£o 'Totais', cÃ³pia literal do nÃºmero impresso. Omita se nÃ£o houver esse campo.",
    },
    solicitante_nome: {
      type: "string",
      description:
        "Nome da PESSOA que fez/solicitou o pedido (um nome de pessoa fÃ­sica, nÃ£o de empresa) â€” costuma aparecer perto de rÃ³tulos " +
        "como 'Comprador:', 'Solicitante:', 'Requisitante:' na seÃ§Ã£o de informaÃ§Ãµes adicionais do pedido (nÃ£o confundir com nomes " +
        "que aparecem apenas na lista de 'AprovaÃ§Ãµes/Aprovadores', que nÃ£o sÃ£o o solicitante). Omita se nÃ£o houver um nome de " +
        "pessoa identificÃ¡vel.",
    },
    local_retirada: {
      type: "string",
      description:
        "EndereÃ§o onde o MOTORISTA deve ir buscar a mercadoria â€” ou seja, o endereÃ§o do FORNECEDOR (a empresa que estÃ¡ vendendo, " +
        "na seÃ§Ã£o 'Dados do Fornecedor': EndereÃ§o, Bairro, MunicÃ­pio, Estado, CEP), nÃ£o o do comprador. NUNCA use o campo 'Local " +
        "de Entrega:' pra este dado â€” em documentos deste tipo esse campo mostra o endereÃ§o da prÃ³pria empresa COMPRADORA (pra " +
        "onde a mercadoria vai depois, nÃ£o de onde ela sai), o que serviria pra entrega, nÃ£o pra coleta. Monte o endereÃ§o juntando " +
        "EndereÃ§o + Bairro + MunicÃ­pio + Estado + CEP do fornecedor num texto sÃ³. Omita se nÃ£o houver esses dados do fornecedor.",
    },
    fornecedor_nome: {
      type: "string",
      description:
        "Nome/razÃ£o social da empresa VENDEDORA â€” o FORNECEDOR que estÃ¡ vendendo a mercadoria (seÃ§Ã£o 'Dados do Fornecedor'), " +
        "nunca a empresa compradora do cabeÃ§alho/timbre. Omita se nÃ£o conseguir identificar com confianÃ§a.",
    },
    condicao_pagamento_codigo: {
      type: "string",
      description:
        "CÃ³digo da condiÃ§Ã£o de pagamento â€” nÃºmero (geralmente com 3 dÃ­gitos, ex: '038') que aparece perto do rÃ³tulo " +
        "'CondiÃ§Ãµes de Pagamento:' na seÃ§Ã£o 'InformaÃ§Ãµes Adicionais'. Copie exatamente os dÃ­gitos impressos, sem adicionar " +
        "nem remover zeros Ã  esquerda. Omita se nÃ£o encontrar esse campo.",
    },
    frete_fob: {
      type: "boolean",
      description:
        "true se a palavra 'FOB' aparecer em QUALQUER lugar do documento (mais comum dentro do campo 'ObservaÃ§Ãµes', mas pode " +
        "estar em outro lugar) â€” sigla que indica que o COMPRADOR (nÃ£o o fornecedor) Ã© responsÃ¡vel por buscar/transportar a " +
        "mercadoria, ou seja, este pedido PRECISA entrar numa rota de coleta. false se a palavra 'FOB' nÃ£o aparecer em lugar " +
        "nenhum do documento (nesse caso, por padrÃ£o, entende-se que o frete Ã© por conta do fornecedor â€” CIF â€” e o pedido nÃ£o " +
        "precisa de coleta).",
    },
    itens: {
      type: "array",
      description: "Cada linha de item/produto da tabela do pedido â€” inclua TODAS as linhas, mesmo que sejam muitas.",
      items: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome/descriÃ§Ã£o do produto ou item." },
          quantidade: { type: "number", description: "Quantidade numÃ©rica do item." },
          unidade: { type: "string", description: "Unidade de medida (ex: KG, UN, SC, L), se houver." },
          valor_unitario: {
            type: "number",
            description:
              "Valor unitÃ¡rio em R$ desta linha (coluna 'Vlr. UnitÃ¡rio' ou equivalente). Apenas nÃºmeros, sem 'R$' e sem " +
              "separador de milhar. Omita se nÃ£o houver essa coluna.",
          },
          valor_total: {
            type: "number",
            description: "Valor total desta linha (quantidade Ã— valor unitÃ¡rio), se houver essa coluna. Omita se nÃ£o houver.",
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
        "fiscal de SERVIÃ‡O (NFS-e/DANFSe, 'Documento Auxiliar da NFS-e', com um campo 'DescriÃ§Ã£o do ServiÃ§o' em vez de " +
        "tabela de itens).",
    },
    numero_nota: {
      type: "string",
      description: "NÃºmero da nota fiscal. Omita se nÃ£o conseguir ler com clareza.",
    },
    valor_total: {
      type: "number",
      description: "SÃ³ em nota de SERVIÃ‡O: 'VALOR TOTAL DA NFS-e'. Em nota de PRODUTO, omita â€” use valor_total_nota_impresso (ver instruÃ§Ãµes).",
    },
    valor_total_nota_impresso: {
      type: "number",
      description:
        "Nota de PRODUTO: cÃ³pia literal do campo 'VALOR TOTAL DA NOTA' (nÃ£o confundir com 'VALOR TOTAL DOS PRODUTOS' â€” ver " +
        "instruÃ§Ãµes). Omita em nota de SERVIÃ‡O ou se ilegÃ­vel.",
    },
    valor_produtos: {
      type: "number",
      description: "Nota de PRODUTO: reserva, sÃ³ se valor_total_nota_impresso nÃ£o puder ser lido. CÃ³pia de 'VALOR TOTAL DOS PRODUTOS'.",
    },
    desconto: {
      type: "number",
      description: "Nota de PRODUTO: reserva (junto com valor_produtos). CÃ³pia de 'DESCONTO'. Omita se nÃ£o houver.",
    },
    destinatario_nome: {
      type: "string",
      description: "Nome de quem RECEBE (DestinatÃ¡rio/Tomador). Nunca quem emitiu.",
    },
    destinatario_cnpj: {
      type: "string",
      description: "CNPJ de quem RECEBE, dentro do quadro DestinatÃ¡rio/Tomador (ver instruÃ§Ãµes sobre confusÃ£o com o CNPJ do emitente). Omita se nÃ£o tiver certeza.",
    },
    emitente_nome: {
      type: "string",
      description: "Nome de quem EMITIU a nota (Emitente/Prestador).",
    },
    data_emissao: {
      type: "string",
      description:
        "Data de emissÃ£o da nota (campo 'Data da EmissÃ£o' ou 'DATA DA EMISSÃƒO'). Formato AAAA-MM-DD (ex: 2026-09-02). Omita " +
        "se nÃ£o conseguir ler com confianÃ§a.",
    },
    parcelas_pagamento: {
      type: "array",
      description:
        "Cada parcela/duplicata da seÃ§Ã£o 'Fatura/Duplicata' (ou 'CÃ¡lculo de Imposto'/rodapÃ© equivalente) â€” ex: 'A PRAZO 30 " +
        "DIAS --> 1: 02/10/2026 - R$ 104,00' vira uma parcela com essa data e valor. Se a nota for Ã  vista ou nÃ£o tiver essa " +
        "seÃ§Ã£o, omita o campo inteiro (nÃ£o invente uma parcela).",
      items: {
        type: "object",
        properties: {
          data_vencimento: { type: "string", description: "Data de vencimento desta parcela, formato AAAA-MM-DD." },
          valor: { type: "number", description: "Valor desta parcela em R$, apenas nÃºmeros." },
        },
        required: ["data_vencimento"],
        additionalProperties: false,
      },
    },
    itens: {
      type: "array",
      description:
        "Cada linha de item/produto da tabela de itens da nota (nota de produto/DANFE) â€” inclua TODAS as linhas. Se for uma " +
        "nota de SERVIÃ‡O (NFS-e/DANFSe, sem tabela de itens), crie UM Ãºnico item usando a 'DescriÃ§Ã£o do ServiÃ§o' como " +
        "produto_nome, quantidade 1 e valor_total igual ao valor total da nota.",
      items: {
        type: "object",
        properties: {
          produto_nome: { type: "string", description: "Nome/descriÃ§Ã£o do produto ou item." },
          quantidade: { type: "number", description: "Quantidade numÃ©rica do item (coluna QTDE ou similar)." },
          unidade: {
            type: "string",
            description: "Sigla da unidade (KG, UN, FD, CX...). Se vier 'FD/0020/UN' (ver instruÃ§Ãµes), copie sÃ³ 'FD' aqui.",
          },
          fator_conversao: {
            type: "number",
            description: "Se a unidade vier como 'FD/0020/UN' (ver instruÃ§Ãµes), copie o nÃºmero do meio (ex: 20). SenÃ£o, omita.",
          },
          valor_unitario: {
            type: "number",
            description: "Valor unitÃ¡rio impresso, cÃ³pia literal, sem dividir por fator_conversao. Omita se nÃ£o houver.",
          },
          valor_total: {
            type: "number",
            description: "Valor total desta linha, se houver essa coluna. Omita se nÃ£o houver.",
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
  "Extraia os dados deste pedido de compra. Preste atenÃ§Ã£o especial a estes pontos:\n\n" +
  "1) EMPRESA COMPRADORA: normalmente nÃ£o tem rÃ³tulo explÃ­cito â€” Ã© a empresa do cabeÃ§alho/timbre no topo do documento (Ã s " +
  "vezes com logotipo), diferente da empresa listada em 'Dados do Fornecedor'. Nunca confunda com o campo 'Comprador:', que " +
  "Ã© uma PESSOA, nÃ£o a empresa.\n\n" +
  "2) VALORES DA SEÃ‡ÃƒO 'TOTAIS': extraia total_mercadorias, frete, despesas e descontos como CÃ“PIA LITERAL dos nÃºmeros " +
  "impressos â€” nÃ£o some nem subtraia nada, isso Ã© calculado depois. NUNCA copie 'ICMS', 'IPI', 'Seguro', 'Total com " +
  "Impostos' ou 'Total Geral' pra esses campos â€” o cÃ¡lculo de imposto deste ERP estÃ¡ incorreto, entÃ£o esses valores nÃ£o " +
  "servem.\n\n" +
  "3) SOLICITANTE: procure o nome de pessoa no campo 'Comprador:'/'Solicitante:'/'Requisitante:' da seÃ§Ã£o de informaÃ§Ãµes do " +
  "pedido â€” nÃ£o confunda com os nomes que aparecem numa eventual lista de aprovadores/aprovaÃ§Ãµes, que nÃ£o sÃ£o o solicitante.\n\n" +
  "4) LOCAL DE RETIRADA: use o endereÃ§o do FORNECEDOR (seÃ§Ã£o 'Dados do Fornecedor': EndereÃ§o, Bairro, MunicÃ­pio, Estado, CEP) â€” " +
  "Ã© lÃ¡ que o motorista vai buscar a mercadoria. NUNCA use o campo 'Local de Entrega:', que Ã© o endereÃ§o da empresa " +
  "COMPRADORA (pra onde a mercadoria vai depois), nÃ£o de onde ela sai.\n\n" +
  "4b) EMPRESA VENDEDORA: extraia tambÃ©m o nome/razÃ£o social do FORNECEDOR (seÃ§Ã£o 'Dados do Fornecedor'), separado do nome " +
  "da empresa compradora.\n\n" +
  "5) FOB: procure a palavra 'FOB' em QUALQUER lugar do texto do documento (mais comum no campo 'ObservaÃ§Ãµes', mas pode " +
  "estar em outro lugar) â€” nÃ£o Ã© um rÃ³tulo de campo, Ã© sÃ³ uma palavra solta que pode ou nÃ£o aparecer em algum ponto do " +
  "documento. Retorne frete_fob=true sÃ³ se a palavra aparecer literalmente; caso contrÃ¡rio, frete_fob=false.\n\n" +
  "6) ITENS: extraia cada linha da tabela de itens (produto, quantidade, valor unitÃ¡rio) â€” nÃ£o misture o valor/quantidade " +
  "de uma linha com o de outra linha vizinha.\n\n" +
  "7) CONDIÃ‡ÃƒO DE PAGAMENTO: copie o cÃ³digo numÃ©rico do campo 'CondiÃ§Ãµes de Pagamento:' (seÃ§Ã£o 'InformaÃ§Ãµes Adicionais'), " +
  "exatamente como impresso (com os zeros Ã  esquerda, se houver).\n\n" +
  "8) Leia os nÃºmeros (CNPJ, valores) com cuidado, dÃ­gito por dÃ­gito, sem inventar ou aproximar.";

const PROMPT_NOTA =
  "Extraia os dados desta nota fiscal. Pode ser uma nota de PRODUTO (DANFE) ou uma nota de SERVIÃ‡O (NFS-e/DANFSe, " +
  "'Documento Auxiliar da NFS-e') â€” identifique qual Ã© pelo cabeÃ§alho do documento antes de extrair, porque os rÃ³tulos " +
  "dos campos mudam entre as duas:\n\n" +
  "- Nota de PRODUTO (DANFE): EMITENTE (quem vendeu) e DESTINATÃRIO (quem recebe a mercadoria); tabela de itens com " +
  "produto/quantidade/valor unitÃ¡rio.\n" +
  "- Nota de SERVIÃ‡O (NFS-e/DANFSe): PRESTADOR/FORNECEDOR (quem prestou o serviÃ§o, equivale ao emitente) e " +
  "TOMADOR/ADQUIRENTE (quem contratou o serviÃ§o, equivale ao destinatÃ¡rio); nÃ£o tem tabela de itens â€” em vez disso tem " +
  "um campo 'DescriÃ§Ã£o do ServiÃ§o' (texto corrido) e um 'VALOR TOTAL DA NFS-e'/'Valor da OperaÃ§Ã£o/ServiÃ§o'. Nesse caso, " +
  "monte um Ãºnico item em itens[] usando essa descriÃ§Ã£o como produto_nome, quantidade 1 e valor_total = valor total da nota.\n\n" +
  "VALOR TOTAL â€” cuidado especial aqui, Ã© a maior fonte de erro: numa nota de PRODUTO (DANFE) NÃƒO preencha o campo " +
  "valor_total â€” em vez disso copie valor_total_nota_impresso diretamente do campo 'VALOR TOTAL DA NOTA' (a Ãºltima caixa " +
  "da seÃ§Ã£o 'CÃ¡lculo do Imposto'). Esse campo fica bem perto de 'VALOR TOTAL DOS PRODUTOS' (um pouco acima) e os dois sÃ£o " +
  "fÃ¡ceis de confundir â€” sÃ£o frequentemente IGUAIS (quando nÃ£o hÃ¡ desconto real aplicado no total, mesmo que exista um " +
  "campo 'DESCONTO' preenchido do lado â€” nem todo desconto impresso Ã© realmente abatido do total, entÃ£o NÃƒO assuma que " +
  "'VALOR TOTAL DA NOTA' Ã© sempre menor), mas leia cada um da sua prÃ³pria caixa, nunca copie o nÃºmero de um campo pro " +
  "outro por parecerem relacionados. SÃ³ se a caixa 'VALOR TOTAL DA NOTA' estiver ilegÃ­vel, preencha valor_produtos e " +
  "desconto (cÃ³pia literal de cada um) como alternativa. Numa nota de SERVIÃ‡O (sem essa seÃ§Ã£o), preencha valor_total " +
  "diretamente com 'VALOR TOTAL DA NFS-e'/'Valor da OperaÃ§Ã£o/ServiÃ§o', e omita valor_total_nota_impresso/valor_produtos/" +
  "desconto.\n\n" +
  "Em qualquer um dos dois casos: o CNPJ e nome de quem RECEBE (destinatÃ¡rio/tomador) sÃ£o os mais importantes de extrair " +
  "corretamente, nÃ£o confunda com o de quem emitiu/prestou. A foto pode ter qualidade ruim, reflexo ou estar levemente " +
  "torta â€” leia com cuidado; se algum campo nÃ£o estiver legÃ­vel com confianÃ§a, omita-o em vez de arriscar um valor errado.\n\n" +
  "Extraia tambÃ©m a DATA DE EMISSÃƒO da nota, e cada parcela/duplicata de pagamento (data de vencimento e valor) da seÃ§Ã£o " +
  "'Fatura/Duplicata' ou equivalente â€” usadas depois pra conferir se o prazo de pagamento bate com a condiÃ§Ã£o combinada no " +
  "pedido. Se a nota for Ã  vista ou nÃ£o tiver essa seÃ§Ã£o, nÃ£o invente uma parcela.\n\n" +
  "COLUNA 'UND' DA TABELA DE ITENS â€” preste atenÃ§Ã£o especial aqui: Ã s vezes vem num formato com barras, tipo 'FD/0020/UN' " +
  "ou 'CX/0012/UN' (sigla da embalagem / quantidade-base / sigla da unidade menor). Isso quer dizer que a quantidade da " +
  "linha estÃ¡ contada em FARDOS/CAIXAS, nÃ£o nas unidades menores â€” ex: '7' na coluna QTD com 'FD/0020/UN' significa 7 " +
  "fardos de 20 unidades cada (140 unidades no total), nÃ£o 7 unidades. Copie a sigla da embalagem (ex: 'FD') no campo " +
  "unidade e o nÃºmero do meio (ex: 20) no campo fator_conversao de cada item â€” sem isso, uma entrega de 140kg pode parecer " +
  "sÃ³ 7kg na comparaÃ§Ã£o com o pedido.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { tipo, file_base64, media_type } = await req.json();
    if (!file_base64 || typeof file_base64 !== "string") {
      return jsonResponse({ error: "Campo file_base64 ausente ou invÃ¡lido." }, 400);
    }
    if (tipo !== "pedido" && tipo !== "nota") {
      return jsonResponse({ error: "Campo tipo deve ser 'pedido' ou 'nota'." }, 400);
    }
    const mediaType = typeof media_type === "string" && media_type ? media_type : "application/pdf";

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "ANTHROPIC_API_KEY nÃ£o configurada no servidor." }, 500);
    }

    const isImage = mediaType.startsWith("image/");
    const fileBlock = isImage
      ? { type: "image", source: { type: "base64", media_type: mediaType, data: file_base64 } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } };

    const schema = tipo === "pedido" ? SCHEMA_PEDIDO : SCHEMA_NOTA;
    const prompt = tipo === "pedido" ? PROMPT_PEDIDO : PROMPT_NOTA;

    // Cache de prompt: a instruÃ§Ã£o + o schema sÃ£o IDÃŠNTICOS em toda leitura
    // do mesmo tipo (pedido ou nota) â€” sÃ³ o arquivo muda a cada chamada. Sem
    // cache, esse texto Ã© recobrado a preÃ§o cheio toda vez; com cache, sÃ³ a
    // primeira chamada de uma leva paga cheio, as prÃ³ximas (dentro de ~5min,
    // ex: o robÃ´ processando vÃ¡rios pedidos seguidos) pagam 10% dessa parte.
    // ReforÃ§a o schema como TEXTO aqui (alÃ©m de jÃ¡ ir estruturado no
    // output_config, que continua garantindo o formato da resposta) sÃ³ pra
    // esse bloco ficar grande o bastante pra valer cache â€” texto curto demais
    // nÃ£o ativa. Importante: o texto cacheÃ¡vel (estÃ¡vel) precisa vir ANTES
    // do arquivo (que muda sempre) pra fazer parte do "prefixo" cacheado.
    const instrucoesCacheaveis =
      `${prompt}\n\n` +
      "Formato esperado da resposta (sua resposta final Ã© validada contra este schema â€” isso aqui Ã© sÃ³ contexto extra " +
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

    // O total Ã© calculado aqui, nÃ£o pelo modelo â€” pedir pra IA somar/subtrair
    // campos espalhados no documento (mercadorias + frete + despesas -
    // descontos) jÃ¡ se mostrou pouco confiÃ¡vel (ela Ã s vezes ignora o
    // desconto). O modelo sÃ³ extrai os nÃºmeros crus; a conta Ã© determinÃ­stica.
    if (tipo === "pedido") {
      // "|| (...)" (nÃ£o "?? (...)") de propÃ³sito, nos dois nÃ­veis abaixo â€”
      // alguns documentos nÃ£o tÃªm coluna de total por linha nem um "Total das
      // Mercadorias" de verdade, e a IA Ã s vezes copia um "0,00" literal do
      // documento em vez de omitir o campo nesse caso. Nem uma linha de item
      // nem um pedido inteiro tÃªm valor 0 de verdade, entÃ£o tratamos 0 igual
      // a "nÃ£o veio" e caÃ­mos pro fallback (quantidadeÃ—valor unitÃ¡rio, depois
      // soma dos itens) â€” sem isso, o pedido salvava com valor zerado (ou atÃ©
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
    // TOTAL DA NOTA" (valor_total_nota_impresso) â€” Ã© o nÃºmero que realmente
    // vale, entÃ£o confiamos nele em vez de recalcular por cima. "VALOR TOTAL
    // DOS PRODUTOS" e "DESCONTO" Ã s vezes jÃ¡ foram usados aqui como se
    // "total = produtos - desconto" fosse sempre verdade, mas achamos um
    // caso real (pedido S51444) em que a nota tinha um campo "DESCONTO"
    // preenchido (R$40,92) e mesmo assim "VALOR TOTAL DA NOTA" saiu igual a
    // "VALOR TOTAL DOS PRODUTOS" (R$372,00 os dois) â€” ou seja, esse desconto
    // nÃ£o se aplicava ao total final daquela nota. Calcular por cima teria
    // dado R$331,08, errado. Por isso agora sÃ³ caÃ­mos pro cÃ¡lculo
    // (produtos - desconto) quando a IA nÃ£o conseguiu ler a caixa "VALOR
    // TOTAL DA NOTA" com confianÃ§a.
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
        // de serviÃ§o) â€” mantÃ©m o valor_total que a IA jÃ¡ leu direto do
        // documento.
      }
    }

    // "usage" vai junto sÃ³ pra dar pra acompanhar o efeito do cache de prompt
    // (cache_read_input_tokens/cache_creation_input_tokens) sem precisar
    // abrir o painel da Anthropic â€” o app nÃ£o usa esse campo pra nada.
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
