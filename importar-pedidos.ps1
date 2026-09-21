# importar-pedidos.ps1
#
# Varre a pasta "Processados" do robô do Avanço para Contratos (que já
# processa os pedidos de compra pra rastrear spot x contrato) e, pra cada
# pedido NOVO, manda pra função de extração por IA (extract-documento) e
# registra automaticamente no "Rotas de Compras" — sem o comprador precisar
# abrir nenhum site. O nome do comprador, a empresa, o valor e o local são
# lidos do próprio documento.
#
# Também varre uma SEGUNDA pasta ("EMBALAGENS INSUMOS AGÍCOLAS"), que não
# passa pelo robô do Avanço para Contratos — os pedidos ficam soltos direto
# na raiz dela. Nessa segunda pasta só os CIF são importados (pedido do
# Danilo, 2026-09-18): arquivos com "FOB" no nome ficam parados lá, sem
# mexer, pra alguém decidir manualmente depois.
#
# FRETE CIF x FOB: decidido pelo NOME DO ARQUIVO (mesma lógica que o robô do
# Avanço para Contratos usa pra decidir spot x contrato). Se o nome do
# arquivo contiver a palavra "FOB" (sem diferenciar maiúsculas/minúsculas), o
# pedido precisa de coleta pelo motorista. Sem "FOB" no nome, é considerado
# CIF (fornecedor entrega).
#
# Depois de processado, o arquivo é movido para uma subpasta (dentro da
# própria pasta de origem):
#   Roteirizados\            -> importado como FOB (nome tem "FOB", precisa de rota)
#   Roteirizados-CIF\        -> importado como CIF (nome sem "FOB", fornecedor entrega)
#   Roteirizados-Duplicados\ -> pulado porque o número do pedido já tinha sido importado
#   Roteirizados-Erros\      -> deu algum problema (confira o log)
#
# RODANDO EM MAIS DE UM COMPUTADOR (redundância, 2026-09-21): este script
# pode ser instalado em várias máquinas ao mesmo tempo, todas apontando pra
# mesma pasta de rede — se uma estiver desligada, a outra continua
# importando. Pra isso não duplicar nem conflitar quando as duas rodam ao
# mesmo tempo, cada arquivo é "reivindicado" primeiro (movido pra uma
# subpasta "Roteirizados-Processando" — um Move-Item é uma operação atômica
# do Windows, então só UMA máquina consegue mover cada arquivo; a outra
# recebe erro e simplesmente pula esse arquivo, sem pisar no trabalho da
# primeira). Cada máquina também grava seu PRÓPRIO arquivo de log
# (identificado pelo nome do computador), pra não haver conflito de escrita
# nem confusão sobre qual máquina processou o quê.
#
# Pra instalar numa segunda máquina: copie esta pasta (rotas-compras-web)
# pra ela, garanta que ela também enxerga as mesmas pastas de rede em
# $Fontes abaixo, e crie a mesma Tarefa Agendada (Agendador de Tarefas do
# Windows, repetir a cada 15 min) apontando pra este arquivo nessa máquina.
# Não precisa mexer em nada do código.
#
# CONFIGURAÇÃO: ajuste os caminhos/datas de corte em $Fontes abaixo se
# mudarem. Ao adicionar uma pasta nova, use a data de HOJE como DataCorte
# (evita importar de uma vez todo o histórico antigo já acumulado nela).

$ErrorActionPreference = "Stop"

# ---------- CONFIGURAÇÃO — ajuste aqui ----------
$Fontes = @(
    @{
        # Pasta principal: FOB e CIF, os dois são importados.
        Pasta     = "W:\COMPRAS\ORDENS DE COMPRA\Processados"
        DataCorte = Get-Date "2026-08-26"
        SoCif     = $false
    },
    @{
        # Pasta de embalagens/insumos agrícolas: só os CIF (sem "FOB" no
        # nome) são importados — arquivos com "FOB" ficam parados aqui,
        # ninguém mexe neles. Sem data de corte (2026-09-18: importado todo
        # o histórico já acumulado nela, a pedido do Danilo) — depois disso
        # só sobra arquivo novo na raiz mesmo, já que o processado é movido
        # pra fora, então não precisa de corte pra frente.
        Pasta     = "W:\COMPRAS\ORDENS DE COMPRA EMBALAGENS INSUMOS AGÍCOLAS"
        DataCorte = Get-Date "2000-01-01"
        SoCif     = $true
    }
)

# Log por máquina (fica na pasta principal, mas cada computador grava o
# seu — ver nota de redundância acima) — assim dá pra rodar em mais de um
# computador sem os logs colidirem ou ficarem misturados.
$LogFile = Join-Path $Fontes[0].Pasta "importacao_rotas_log_$($env:COMPUTERNAME).txt"
# --------------------------------------------------

$SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co"
$SUPABASE_KEY = "sb_publishable_4fZ0DlFJq1ec5xTXurwGSQ_Ke3JELGZ"
# Nome real no Supabase é "rapid-service" (o campo de nome não pegou
# "extract-documento" ao publicar pela primeira vez).
$EXTRACT_URL = "$SUPABASE_URL/functions/v1/rapid-service"

function Write-Log($mensagem) {
    $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $mensagem"
    # Pequeno retry — mesmo com log por máquina, um antivírus ou outro
    # processo local pode segurar o arquivo por uma fração de segundo.
    for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
        try {
            Add-Content -Path $LogFile -Value $linha -Encoding utf8 -ErrorAction Stop
            break
        } catch {
            if ($tentativa -eq 3) { Write-Output "(falha ao gravar log) $linha" }
            else { Start-Sleep -Milliseconds 300 }
        }
    }
    Write-Output $linha
}

$HeadersJson = @{
    "apikey"        = $SUPABASE_KEY
    "authorization" = "Bearer $SUPABASE_KEY"
    "content-type"  = "application/json"
}

# Invoke-RestMethod, quando -Body é uma string, não codifica em UTF-8 por
# padrão no Windows PowerShell 5.1 — nomes com acento (fornecedor, endereço)
# corrompiam o JSON enviado e a Supabase respondia "Empty or invalid json"
# (PGRST102). Convertendo a string pra bytes UTF-8 explicitamente antes de
# enviar, o problema não ocorre.
function Invoke-JsonPost($uri, $headers, $jsonBody) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
    return Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -Body $bytes
}

function Detalhe-Erro($erro) {
    $msg = $erro.Exception.Message
    if ($erro.Exception.Response) {
        try {
            $stream = $erro.Exception.Response.GetResponseStream()
            $stream.Position = 0
            $reader = New-Object System.IO.StreamReader($stream)
            $corpo = $reader.ReadToEnd()
            if ($corpo) { $msg = "$msg | corpo: $corpo" }
        } catch {}
    }
    return $msg
}

function ApenasDigitos($texto) {
    if ([string]::IsNullOrWhiteSpace($texto)) { return "" }
    return ($texto -replace '\D', '')
}

function MediaTypePorExtensao($extensao) {
    switch ($extensao.ToLower()) {
        "pdf"  { return "application/pdf" }
        "png"  { return "image/png" }
        "jpg"  { return "image/jpeg" }
        "jpeg" { return "image/jpeg" }
        default { return "application/octet-stream" }
    }
}

# ---------- carrega cadastros existentes (pra achar por CNPJ/nome antes de criar novo) ----------
$empresas = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rl_empresas?select=id,nome,cnpj,ativo&ativo=eq.true" -Headers $HeadersJson -Method Get
$compradores = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/rl_compradores?select=id,nome,ativo&ativo=eq.true" -Headers $HeadersJson -Method Get

function Find-Empresa($nome, $cnpj) {
    $cnpjAlvo = ApenasDigitos $cnpj
    if ($cnpjAlvo) {
        $match = $empresas | Where-Object { (ApenasDigitos $_.cnpj) -eq $cnpjAlvo -and $_.cnpj } | Select-Object -First 1
        if ($match) { return $match }
    }
    if ($nome) {
        $alvo = $nome.Trim().ToLower()
        $match = $empresas | Where-Object { $_.nome.Trim().ToLower() -eq $alvo } | Select-Object -First 1
        if ($match) { return $match }
    }
    return $null
}

function Get-OrCreate-Empresa($nome, $cnpj) {
    if (-not $nome) { return $null }
    $existente = Find-Empresa $nome $cnpj
    if ($existente) { return $existente }

    $body = @{ nome = $nome; cnpj = if ($cnpj) { $cnpj } else { $null } } | ConvertTo-Json
    $headers = $HeadersJson.Clone()
    $headers["Prefer"] = "return=representation"
    $novo = Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_empresas" $headers $body
    $script:empresas += $novo[0]
    return $novo[0]
}

function Get-OrCreate-Comprador($nome) {
    if ([string]::IsNullOrWhiteSpace($nome)) { $nome = "Importação automática" }
    $alvo = $nome.Trim().ToLower()
    $existente = $compradores | Where-Object { $_.nome.Trim().ToLower() -eq $alvo } | Select-Object -First 1
    if ($existente) { return $existente.nome }

    $body = @{ nome = $nome.Trim() } | ConvertTo-Json
    $headers = $HeadersJson.Clone()
    $headers["Prefer"] = "return=representation"
    $novo = Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_compradores" $headers $body
    $script:compradores += $novo[0]
    return $novo[0].nome
}

function Test-PedidoJaImportado($numeroPedido) {
    if ([string]::IsNullOrWhiteSpace($numeroPedido)) { return $false }
    $uri = "$SUPABASE_URL/rest/v1/rl_pedidos?select=id&numero_pedido=eq.$([uri]::EscapeDataString($numeroPedido))&limit=1"
    $existe = Invoke-RestMethod -Uri $uri -Headers $HeadersJson -Method Get
    return ($existe.Count -gt 0)
}

function Upload-Arquivo($caminhoArquivo, $nomeDestino, $contentType) {
    $uri = "$SUPABASE_URL/storage/v1/object/rl_pedidos/$nomeDestino"
    $headers = @{
        "apikey"        = $SUPABASE_KEY
        "authorization" = "Bearer $SUPABASE_KEY"
        "content-type"  = $contentType
    }
    Invoke-RestMethod -Uri $uri -Headers $headers -Method Post -InFile $caminhoArquivo | Out-Null
    return "$SUPABASE_URL/storage/v1/object/public/rl_pedidos/$nomeDestino"
}

# ---------- processa uma fonte (pasta) ----------
function Processar-Fonte($fonte) {
    $pastaMonitorada = $fonte.Pasta
    if (-not (Test-Path $pastaMonitorada)) {
        Write-Log "AVISO: pasta não encontrada, pulando: $pastaMonitorada"
        return
    }

    $pastaRoteirizados = Join-Path $pastaMonitorada "Roteirizados"
    $pastaCif = Join-Path $pastaMonitorada "Roteirizados-CIF"
    $pastaDuplicados = Join-Path $pastaMonitorada "Roteirizados-Duplicados"
    $pastaErros = Join-Path $pastaMonitorada "Roteirizados-Erros"
    # Área de "reivindicação" — ver nota de redundância no topo do arquivo.
    $pastaProcessando = Join-Path $pastaMonitorada "Roteirizados-Processando"

    $pastasNecessarias = if ($fonte.SoCif) { @($pastaCif, $pastaDuplicados, $pastaErros, $pastaProcessando) } else { @($pastaRoteirizados, $pastaCif, $pastaDuplicados, $pastaErros, $pastaProcessando) }
    foreach ($p in $pastasNecessarias) {
        if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p | Out-Null }
    }

    # Nota: -Include só funciona corretamente com -Path terminando em "\*"
    # (sem isso, o PowerShell silenciosamente retorna 0 arquivos mesmo
    # havendo arquivos que baterim com o filtro).
    $arquivos = Get-ChildItem -Path (Join-Path $pastaMonitorada "*") -Include *.pdf, *.jpg, *.jpeg, *.png -File |
        Sort-Object FullName -Unique |
        Where-Object { $_.LastWriteTime -ge $fonte.DataCorte }

    if ($arquivos.Count -eq 0) {
        Write-Log "Nenhum arquivo novo encontrado em '$pastaMonitorada'."
        return
    }

    foreach ($arquivoOriginal in $arquivos) {
        # Frete CIF x FOB é decidido pelo NOME DO ARQUIVO (mesmo padrão do
        # robô do Avanço para Contratos, que decide spot x contrato do mesmo
        # jeito).
        $ehFob = $arquivoOriginal.Name -imatch "FOB"

        if ($fonte.SoCif -and $ehFob) {
            Write-Log "Pulando '$($arquivoOriginal.Name)' (tem FOB no nome - essa pasta so importa CIF; arquivo nao foi movido)."
            continue
        }

        # Reivindica o arquivo movendo pra pasta "Processando" ANTES de
        # gastar tempo/dinheiro com IA — um Move-Item é atômico no Windows,
        # então se outra máquina já pegou esse arquivo no mesmo instante,
        # este Move-Item falha aqui e a gente simplesmente pula ele (sem
        # log de erro — é o funcionamento normal esperado da redundância,
        # não uma falha).
        $caminhoReivindicado = Join-Path $pastaProcessando $arquivoOriginal.Name
        try {
            Move-Item -Path $arquivoOriginal.FullName -Destination $caminhoReivindicado -ErrorAction Stop
        } catch {
            continue
        }
        $arquivo = Get-Item $caminhoReivindicado

        Write-Log "Processando: $($arquivo.Name)"
        try {
            $extensao = $arquivo.Extension.TrimStart(".")
            $mediaType = MediaTypePorExtensao $extensao

            $bytes = [System.IO.File]::ReadAllBytes($arquivo.FullName)
            $base64 = [System.Convert]::ToBase64String($bytes)
            $payload = @{ tipo = "pedido"; file_base64 = $base64; media_type = $mediaType } | ConvertTo-Json

            # Tenta até 3 vezes — erros passageiros do servidor não devem
            # jogar o arquivo pra pasta de Erros de primeira.
            $resposta = $null
            $ultimoErro = $null
            for ($tentativa = 1; $tentativa -le 3; $tentativa++) {
                try {
                    $resposta = Invoke-RestMethod -Uri $EXTRACT_URL -Headers $HeadersJson -Method Post -Body $payload -TimeoutSec 120
                    $ultimoErro = $null
                    break
                } catch {
                    $ultimoErro = $_
                    Write-Log "  Tentativa $tentativa falhou ($(Detalhe-Erro $_))$(if ($tentativa -lt 3) { ', tentando de novo em 10s...' })"
                    if ($tentativa -lt 3) { Start-Sleep -Seconds 10 }
                }
            }
            if ($ultimoErro) { throw $ultimoErro }
            if ($resposta.error) { throw "Extração falhou: $($resposta.error)" }
            $dados = $resposta.data

            # Pedidos que o fornecedor despacha pra uma transportadora (o
            # motorista retira lá, não no próprio fornecedor) também são
            # identificados pelo nome do arquivo — vão pra uma tela
            # separada, já que o motorista passa na transportadora todo dia
            # sem saber de antemão o que já chegou.
            $retirarTransportadora = $arquivo.Name -imatch "transportadora"

            # Segunda camada de segurança contra duplicata (além da
            # reivindicação por Move-Item acima) — cobre o caso raro de o
            # MESMO pedido vir em dois arquivos/pastas diferentes.
            if (Test-PedidoJaImportado $dados.numero_pedido) {
                Write-Log "  Pedido Nº $($dados.numero_pedido) já importado antes — pulando (movido para Roteirizados-Duplicados)."
                Move-Item -Path $arquivo.FullName -Destination (Join-Path $pastaDuplicados $arquivo.Name) -Force
                continue
            }

            $empresa = Get-OrCreate-Empresa $dados.empresa_compradora_nome $dados.empresa_compradora_cnpj
            $compradorNome = Get-OrCreate-Comprador $dados.solicitante_nome

            $nomeArquivoStorage = "$([guid]::NewGuid().ToString()).$extensao"
            $arquivoUrl = Upload-Arquivo $arquivo.FullName $nomeArquivoStorage $mediaType

            $pedido = @{
                comprador_nome  = $compradorNome
                empresa_id      = if ($empresa) { $empresa.id } else { $null }
                empresa_nome    = if ($empresa) { $empresa.nome } else { $dados.empresa_compradora_nome }
                # Prefere o CNPJ REALMENTE lido no pedido — a Wehrmann tem
                # mais de uma filial (CNPJs diferentes) sob o mesmo nome no
                # cadastro; usar o CNPJ genérico do cadastro em vez do lido
                # causava divergência falsa na conferência com a nota (que
                # vem da filial certa).
                empresa_cnpj    = if ($dados.empresa_compradora_cnpj) { $dados.empresa_compradora_cnpj } elseif ($empresa) { $empresa.cnpj } else { $null }
                fornecedor_nome = if ($dados.fornecedor_nome) { $dados.fornecedor_nome } else { $null }
                condicao_pagamento_codigo = if ($dados.condicao_pagamento_codigo) { $dados.condicao_pagamento_codigo } else { $null }
                numero_pedido   = if ($dados.numero_pedido) { $dados.numero_pedido } else { $null }
                local_retirada  = if ($dados.local_retirada) { $dados.local_retirada } else { $null }
                arquivo_url     = $arquivoUrl
                arquivo_nome    = $arquivo.Name
                valor_total     = if ($null -ne $dados.valor_total) { $dados.valor_total } else { $null }
                itens           = if ($dados.itens) { $dados.itens } else { $null }
                urgente         = $false
                retirar_transportadora = $retirarTransportadora
                frete_fob       = $ehFob
                status          = "pendente"
            } | ConvertTo-Json -Depth 6
            Invoke-JsonPost "$SUPABASE_URL/rest/v1/rl_pedidos" $HeadersJson $pedido | Out-Null

            $pastaDestino = if ($ehFob) { $pastaRoteirizados } else { $pastaCif }
            Write-Log "  OK ($(if ($ehFob) { 'FOB' } else { 'CIF' })$(if ($retirarTransportadora) { ', transportadora' })): comprador '$compradorNome', empresa '$($dados.empresa_compradora_nome)', valor=$($dados.valor_total), pedido=$($dados.numero_pedido)"
            Move-Item -Path $arquivo.FullName -Destination (Join-Path $pastaDestino $arquivo.Name) -Force
        }
        catch {
            Write-Log "  ERRO: $(Detalhe-Erro $_)"
            if (Test-Path $arquivo.FullName) {
                Move-Item -Path $arquivo.FullName -Destination (Join-Path $pastaErros $arquivo.Name) -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

foreach ($fonte in $Fontes) {
    Processar-Fonte $fonte
}

Write-Log "Execução concluída."
