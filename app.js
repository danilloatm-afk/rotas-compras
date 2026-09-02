const SUPABASE_URL = "https://jvfyqvefznkpcvjaerta.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2ZnlxdmVmem5rcGN2amFlcnRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTQ4NjgsImV4cCI6MjEwMTc5MDg2OH0.2Ef6LpZ61WM8myHBYeQGo3TuGqk5C3x36ER_sWRNPS4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Chave publicável do mesmo projeto Supabase, usada só pra chamar a Edge
// Function (mesma chave já usada no app Avanço para Contratos).
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_4fZ0DlFJq1ec5xTXurwGSQ_Ke3JELGZ";
// Nome real no Supabase é "rapid-service" (o campo de nome não pegou
// "extract-documento" ao publicar pela primeira vez — mesma situação da
// function "rapid-action" do Avanço para Contratos).
const EXTRACT_URL = `${SUPABASE_URL}/functions/v1/rapid-service`;

const TOLERANCIA_VALOR = 0.05;

// ---------- tema claro/escuro ----------
const LS_TEMA = "rl_tema";

function temaEfetivoEscuro(tema) {
  if (tema === "dark") return true;
  if (tema === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function aplicarTema(tema) {
  if (tema === "light" || tema === "dark") {
    document.documentElement.setAttribute("data-theme", tema);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  document.getElementById("btn-theme-toggle").textContent = temaEfetivoEscuro(tema) ? "☀️" : "🌙";
}

let temaAtual = localStorage.getItem(LS_TEMA) || "auto";
aplicarTema(temaAtual);

document.getElementById("btn-theme-toggle").addEventListener("click", () => {
  temaAtual = temaEfetivoEscuro(temaAtual) ? "light" : "dark";
  localStorage.setItem(LS_TEMA, temaAtual);
  aplicarTema(temaAtual);
});

// ---------- helpers ----------
// alert()/prompt() nativos não são confiáveis em vários navegadores/webviews
// (já vimos prompt() falhar em produção) — este toast substitui os avisos.
function mostrarAviso(mensagem) {
  const toast = document.createElement("div");
  toast.className = "toast-aviso";
  toast.textContent = mensagem;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function comTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), ms)),
  ]);
}

function apenasDigitos(str) {
  return String(str || "").replace(/\D/g, "");
}

function formatarMoeda(v) {
  if (v == null || v === "") return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function arquivoParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

function extensaoArquivo(file) {
  const porNome = (file.name || "").split(".").pop();
  if (porNome && porNome.length <= 5) return porNome.toLowerCase();
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  return "jpg";
}

async function uploadArquivo(file, bucket) {
  const nome = `${crypto.randomUUID()}.${extensaoArquivo(file)}`;
  const { error } = await db.storage.from(bucket).upload(nome, file, { contentType: file.type || "application/octet-stream" });
  if (error) throw error;
  return { path: nome, url: `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${nome}` };
}

async function lerComIA(file, tipo) {
  const base64 = await arquivoParaBase64(file);
  const resp = await fetch(EXTRACT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ tipo, file_base64: base64, media_type: file.type || "application/pdf" }),
  });
  const resultado = await resp.json();
  if (!resp.ok || resultado.error) throw new Error(resultado.error || "Falha ao ler o documento.");
  return resultado.data;
}

async function checarPedidoDuplicado(numeroPedido) {
  const aviso = document.getElementById("pedido-duplicado-aviso");
  if (!numeroPedido) {
    aviso.classList.add("hidden");
    return;
  }
  const { data } = await comTimeout(db.from("rl_pedidos").select("criado_em").eq("numero_pedido", numeroPedido).limit(1));
  if (data && data.length) {
    aviso.textContent = `⚠️ O pedido Nº ${numeroPedido} já foi importado antes (em ${formatarDataHora(data[0].criado_em)}). Confira se não é duplicado antes de enviar.`;
    aviso.classList.remove("hidden");
  } else {
    aviso.classList.add("hidden");
  }
}

document.getElementById("pedido-numero").addEventListener("change", (e) => checarPedidoDuplicado(e.target.value.trim()));

// ---------- tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "comprador") loadMeusPedidos();
    if (btn.dataset.tab === "motorista") {
      loadDisponiveis();
      loadRotaAtual();
    }
    if (btn.dataset.tab === "indicadores") loadIndicadores();
    if (btn.dataset.tab === "historico") loadHistorico();
    if (btn.dataset.tab === "config") renderCadastros();
  });
});

// ---------- caches ----------
let compradoresCache = [];
let motoristasCache = [];
let empresasCache = [];
let almoxarifesCache = [];

async function loadCompradores() {
  const { data, error } = await comTimeout(db.from("rl_compradores").select("*").order("ativo", { ascending: false }).order("nome"));
  compradoresCache = error ? compradoresCache : data || [];
  const sel = document.getElementById("comprador-select");
  const atual = localStorage.getItem("rl_comprador_atual") || sel.value;
  sel.innerHTML =
    `<option value="">— selecione —</option>` +
    compradoresCache.filter((c) => c.ativo).map((c) => `<option value="${escapeHtml(c.nome)}">${escapeHtml(c.nome)}</option>`).join("");
  if (atual) sel.value = atual;
}

async function loadMotoristas() {
  const { data, error } = await comTimeout(db.from("rl_motoristas").select("*").order("ativo", { ascending: false }).order("nome"));
  motoristasCache = error ? motoristasCache : data || [];
  const sel = document.getElementById("motorista-select");
  const atual = localStorage.getItem("rl_motorista_atual") || sel.value;
  sel.innerHTML =
    `<option value="">— selecione —</option>` +
    motoristasCache.filter((m) => m.ativo).map((m) => `<option value="${escapeHtml(m.nome)}">${escapeHtml(m.nome)}</option>`).join("");
  if (atual) sel.value = atual;
}

async function loadAlmoxarifes() {
  const { data, error } = await comTimeout(db.from("rl_almoxarifes").select("*").order("ativo", { ascending: false }).order("nome"));
  almoxarifesCache = error ? almoxarifesCache : data || [];
  const sel = document.getElementById("almoxarife-select");
  const atual = localStorage.getItem("rl_almoxarife_atual") || sel.value;
  sel.innerHTML =
    `<option value="">— selecione —</option>` +
    almoxarifesCache.filter((a) => a.ativo).map((a) => `<option value="${escapeHtml(a.nome)}">${escapeHtml(a.nome)}</option>`).join("");
  if (atual) sel.value = atual;
}

async function loadEmpresas() {
  const { data, error } = await comTimeout(db.from("rl_empresas").select("*").order("ativo", { ascending: false }).order("nome"));
  empresasCache = error ? empresasCache : data || [];
  const sel = document.getElementById("pedido-empresa");
  const atual = sel.value;
  sel.innerHTML =
    `<option value="">— selecione —</option>` +
    empresasCache
      .filter((e) => e.ativo)
      .map((e) => `<option value="${e.id}">${escapeHtml(e.nome)}${e.cnpj ? ` — ${escapeHtml(e.cnpj)}` : ""}</option>`)
      .join("");
  if (atual) sel.value = atual;
}

document.getElementById("comprador-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_comprador_atual", e.target.value);
  loadMeusPedidos();
});

document.getElementById("motorista-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_motorista_atual", e.target.value);
  rotaAtualId = null;
  loadRotaAtual();
});

// window.prompt() não é confiável em vários navegadores/webviews (em
// especial no celular, onde o motorista vai usar) — por isso usamos um
// campo de texto normal na tela em vez de uma caixa de diálogo nativa.
document.getElementById("btn-novo-comprador").addEventListener("click", () => {
  document.getElementById("form-novo-comprador").classList.remove("hidden");
  const input = document.getElementById("novo-comprador-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-comprador").addEventListener("click", () => {
  document.getElementById("form-novo-comprador").classList.add("hidden");
});

async function confirmarNovoComprador() {
  const nome = document.getElementById("novo-comprador-nome").value.trim();
  if (!nome) return;
  const existente = compradoresCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_compradores").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadCompradores();
  document.getElementById("comprador-select").value = nome;
  localStorage.setItem("rl_comprador_atual", nome);
  document.getElementById("form-novo-comprador").classList.add("hidden");
  loadMeusPedidos();
}

document.getElementById("btn-confirmar-novo-comprador").addEventListener("click", confirmarNovoComprador);
document.getElementById("novo-comprador-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoComprador();
});

document.getElementById("btn-novo-motorista").addEventListener("click", () => {
  document.getElementById("form-novo-motorista").classList.remove("hidden");
  const input = document.getElementById("novo-motorista-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-motorista").addEventListener("click", () => {
  document.getElementById("form-novo-motorista").classList.add("hidden");
});

async function confirmarNovoMotorista() {
  const nome = document.getElementById("novo-motorista-nome").value.trim();
  if (!nome) return;
  const existente = motoristasCache.find((m) => m.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_motoristas").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadMotoristas();
  document.getElementById("motorista-select").value = nome;
  localStorage.setItem("rl_motorista_atual", nome);
  document.getElementById("form-novo-motorista").classList.add("hidden");
  rotaAtualId = null;
  loadRotaAtual();
}

document.getElementById("btn-confirmar-novo-motorista").addEventListener("click", confirmarNovoMotorista);
document.getElementById("novo-motorista-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoMotorista();
});

document.getElementById("btn-novo-almoxarife").addEventListener("click", () => {
  document.getElementById("form-novo-almoxarife").classList.remove("hidden");
  const input = document.getElementById("novo-almoxarife-nome");
  input.value = "";
  input.focus();
});

document.getElementById("btn-cancelar-novo-almoxarife").addEventListener("click", () => {
  document.getElementById("form-novo-almoxarife").classList.add("hidden");
});

async function confirmarNovoAlmoxarife() {
  const nome = document.getElementById("novo-almoxarife-nome").value.trim();
  if (!nome) return;
  const existente = almoxarifesCache.find((a) => a.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_almoxarifes").insert({ nome });
    if (error) {
      mostrarAviso("Erro ao cadastrar: " + error.message);
      return;
    }
  }
  await loadAlmoxarifes();
  document.getElementById("almoxarife-select").value = nome;
  localStorage.setItem("rl_almoxarife_atual", nome);
  document.getElementById("form-novo-almoxarife").classList.add("hidden");
}

document.getElementById("btn-confirmar-novo-almoxarife").addEventListener("click", confirmarNovoAlmoxarife);
document.getElementById("novo-almoxarife-nome").addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmarNovoAlmoxarife();
});

document.getElementById("almoxarife-select").addEventListener("change", (e) => {
  localStorage.setItem("rl_almoxarife_atual", e.target.value);
});

// O nome de quem pediu já vem escrito no próprio documento (campo
// "Comprador:") — não faz sentido pedir de novo pra pessoa que só está
// anexando o arquivo. Acha o cadastro pelo nome (ignorando maiúscula/
// espaço) ou cria um novo automaticamente, igual o robô faz.
async function selecionarOuCriarComprador(nomeLido) {
  const nome = (nomeLido || "").trim();
  if (!nome) return;
  const existente = compradoresCache.find((c) => c.nome.trim().toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_compradores").insert({ nome });
    if (error) return;
    await loadCompradores();
  }
  const nomeFinal = existente ? existente.nome : nome;
  document.getElementById("comprador-select").value = nomeFinal;
  localStorage.setItem("rl_comprador_atual", nomeFinal);
  loadMeusPedidos();
}

// ---------- comprador: ler pedido com IA ----------
let pedidoItensExtraidos = null;
let pedidoFornecedorExtraido = null;

document.getElementById("btn-ler-pedido").addEventListener("click", async () => {
  const input = document.getElementById("pedido-arquivo");
  const feedback = document.getElementById("pedido-ia-feedback");
  const file = input.files && input.files[0];
  if (!file) {
    feedback.textContent = "Selecione um arquivo primeiro.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Lendo documento com IA (pode levar alguns segundos)...";
  feedback.className = "feedback";
  try {
    const extraido = await lerComIA(file, "pedido");
    pedidoItensExtraidos = Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null;
    pedidoFornecedorExtraido = extraido.fornecedor_nome || null;
    if (extraido.valor_total != null) document.getElementById("pedido-valor").value = extraido.valor_total;
    if (extraido.numero_pedido) document.getElementById("pedido-numero").value = extraido.numero_pedido;
    if (extraido.local_retirada) document.getElementById("pedido-local").value = extraido.local_retirada;
    await checarPedidoDuplicado(extraido.numero_pedido);
    await selecionarOuCriarComprador(extraido.solicitante_nome);

    const cnpjLido = apenasDigitos(extraido.empresa_compradora_cnpj);
    let empresaEncontrada = null;
    if (cnpjLido) empresaEncontrada = empresasCache.find((e) => apenasDigitos(e.cnpj) === cnpjLido);
    if (!empresaEncontrada && extraido.empresa_compradora_nome) {
      const nomeAlvo = extraido.empresa_compradora_nome.trim().toLowerCase();
      empresaEncontrada = empresasCache.find((e) => e.nome.trim().toLowerCase() === nomeAlvo);
    }

    const info = document.getElementById("pedido-empresa-info");
    if (empresaEncontrada) {
      document.getElementById("pedido-empresa").value = String(empresaEncontrada.id);
      info.textContent = "";
    } else {
      info.textContent = `IA leu: "${extraido.empresa_compradora_nome || "?"}"${
        extraido.empresa_compradora_cnpj ? ` (CNPJ ${extraido.empresa_compradora_cnpj})` : ""
      } — não encontrada no cadastro. Selecione manualmente ou cadastre em Configurações.`;
    }
    // Frete CIF x FOB é decidido pelo nome do arquivo (mesmo padrão do robô e
    // do Avanço para Contratos, que decide spot x contrato do mesmo jeito).
    if (/fob/i.test(file.name)) {
      feedback.textContent = "Documento lido (nome do arquivo indica frete FOB — precisa de coleta). Confira os campos abaixo antes de enviar.";
      feedback.className = "feedback success";
    } else {
      feedback.textContent =
        '⚠️ O nome do arquivo não tem "FOB" — parece ser frete CIF (fornecedor entrega), que normalmente não precisa de ' +
        "coleta. Confira antes de enviar; envie mesmo assim só se tiver certeza que precisa de rota (ou renomeie o arquivo " +
        'incluindo "FOB" antes de anexar).';
      feedback.className = "feedback error";
    }
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

// ---------- comprador: enviar pedido ----------
document.getElementById("form-pedido").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("pedido-feedback");
  const compradorNome = document.getElementById("comprador-select").value;
  const file = document.getElementById("pedido-arquivo").files[0];
  if (!compradorNome) {
    feedback.textContent = "Selecione seu nome (comprador) primeiro.";
    feedback.className = "feedback error";
    return;
  }
  if (!file) {
    feedback.textContent = "Anexe o arquivo do pedido.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Enviando...";
  feedback.className = "feedback";
  try {
    const { url } = await uploadArquivo(file, "rl_pedidos");
    const empresaId = document.getElementById("pedido-empresa").value || null;
    const empresa = empresaId ? empresasCache.find((e) => String(e.id) === empresaId) : null;
    const valor = document.getElementById("pedido-valor").value;

    const { error } = await db.from("rl_pedidos").insert({
      comprador_nome: compradorNome,
      empresa_id: empresaId,
      empresa_nome: empresa ? empresa.nome : null,
      empresa_cnpj: empresa ? empresa.cnpj : null,
      numero_pedido: document.getElementById("pedido-numero").value.trim() || null,
      local_retirada: document.getElementById("pedido-local").value.trim() || null,
      arquivo_url: url,
      arquivo_nome: file.name,
      observacao: document.getElementById("pedido-observacao").value.trim() || null,
      // Mesmo padrão do FOB: decide pelo nome do arquivo, sem exigir campo
      // manual — a maioria dos pedidos chega pelo robô, não por este formulário.
      retirar_transportadora: /transportadora/i.test(file.name),
      valor_total: valor ? Number(valor) : null,
      itens: pedidoItensExtraidos,
      fornecedor_nome: pedidoFornecedorExtraido,
    });
    if (error) throw error;

    feedback.textContent = "Pedido enviado com sucesso!";
    feedback.className = "feedback success";
    document.getElementById("form-pedido").reset();
    document.getElementById("pedido-empresa-info").textContent = "";
    document.getElementById("pedido-ia-feedback").textContent = "";
    document.getElementById("pedido-duplicado-aviso").classList.add("hidden");
    pedidoItensExtraidos = null;
    pedidoFornecedorExtraido = null;
    loadMeusPedidos();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

function badgeStatus(status) {
  const label = { pendente: "Pendente", na_rota: "Na rota", concluido: "Concluído", cancelado: "Cancelado" }[status] || status;
  return `<span class="badge status-${status}">${label}</span>`;
}

async function loadMeusPedidos() {
  const el = document.getElementById("lista-meus-pedidos");
  const compradorNome = document.getElementById("comprador-select").value;
  if (!compradorNome) {
    el.innerHTML = `<p class="empty-state">Selecione seu nome acima para ver seus pedidos.</p>`;
    return;
  }
  const { data, error } = await comTimeout(
    db.from("rl_pedidos").select("*").eq("comprador_nome", compradorNome).order("criado_em", { ascending: false }).limit(50)
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido enviado ainda.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa não informada")}</strong>
        ${badgeStatus(p.status)}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">🏢 ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
      ${p.parcial_esperado ? `<span class="badge parcial">📦 Pode vir parcial</span>` : ""}
      <div class="card-meta">${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` · Nº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      ${p.local_retirada ? `<div class="card-meta">📍 ${escapeHtml(p.local_retirada)}</div>` : ""}
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">📎 ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      ${
        p.status === "pendente"
          ? `<button class="link-btn danger" data-cancelar="${p.id}" type="button">Cancelar pedido</button>`
          : ""
      }
    </div>`
    )
    .join("");
}

// confirm() nativo tem o mesmo problema do prompt() em alguns navegadores —
// exige clicar duas vezes no próprio botão em vez de abrir um diálogo.
document.getElementById("lista-meus-pedidos").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-cancelar]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Cancelar pedido";
    }, 4000);
    return;
  }
  await db.from("rl_pedidos").update({ status: "cancelado" }).eq("id", btn.dataset.cancelar);
  loadMeusPedidos();
});

// ---------- motorista: pedidos disponíveis ----------
// A cidade não é um campo separado — vem embutida no texto de local_retirada
// (ex: "AV X, BAIRRO Y, GOIANIA, GO, CEP 74463-330"). Extrai o nome da
// cidade procurando o trecho logo antes da sigla de 2 letras do estado.
function extrairCidade(local) {
  if (!local) return null;
  const m = local.match(/,\s*([^,]+?)\s*,\s*[A-Z]{2}\b/);
  return m ? m[1].trim() : null;
}

let disponiveisCache = [];
let cidadesSelecionadas = new Set();

async function loadDisponiveis() {
  const el = document.getElementById("lista-disponiveis");
  const { data, error } = await comTimeout(
    db.from("rl_pedidos").select("*").eq("status", "pendente").order("urgente", { ascending: false }).order("criado_em")
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos.</p>`;
    return;
  }
  disponiveisCache = data;

  const cidades = [
    ...new Set(data.filter((p) => !p.retirar_transportadora).map((p) => extrairCidade(p.local_retirada)).filter(Boolean)),
  ].sort();
  // Descarta da seleção qualquer cidade que não existe mais na lista atual.
  cidadesSelecionadas = new Set([...cidadesSelecionadas].filter((c) => cidades.includes(c)));
  const opcoesCidade = document.getElementById("opcoes-filtro-cidade");
  opcoesCidade.innerHTML = cidades
    .map(
      (c) => `
    <label class="filtro-multiplo-item">
      <input type="checkbox" class="filtro-cidade-check" value="${escapeHtml(c)}" ${cidadesSelecionadas.has(c) ? "checked" : ""}>
      ${escapeHtml(c)}
    </label>`
    )
    .join("");
  atualizarBotaoFiltroCidade();

  const naoTransportadora = data.filter((p) => !p.retirar_transportadora);

  const selComprador = document.getElementById("filtro-comprador");
  const compradorAtual = selComprador.value;
  const compradores = [...new Set(naoTransportadora.map((p) => p.comprador_nome).filter(Boolean))].sort();
  selComprador.innerHTML = `<option value="">Todos os compradores</option>` + compradores.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (compradores.includes(compradorAtual)) selComprador.value = compradorAtual;

  const selFornecedor = document.getElementById("filtro-fornecedor");
  const fornecedorAtual = selFornecedor.value;
  const fornecedores = [...new Set(naoTransportadora.map((p) => p.fornecedor_nome).filter(Boolean))].sort();
  selFornecedor.innerHTML =
    `<option value="">Todos os fornecedores</option>` + fornecedores.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  if (fornecedores.includes(fornecedorAtual)) selFornecedor.value = fornecedorAtual;

  renderDisponiveis();
  renderTransportadora();
}

function atualizarBotaoFiltroCidade() {
  const btn = document.getElementById("btn-filtro-cidade");
  if (cidadesSelecionadas.size === 0) btn.textContent = "Todas as cidades";
  else if (cidadesSelecionadas.size === 1) btn.textContent = [...cidadesSelecionadas][0];
  else btn.textContent = `${cidadesSelecionadas.size} cidades ▾`;
}

document.getElementById("btn-filtro-cidade").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("opcoes-filtro-cidade").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".filtro-multiplo")) document.getElementById("opcoes-filtro-cidade").classList.add("hidden");
});
document.getElementById("opcoes-filtro-cidade").addEventListener("change", (e) => {
  const chk = e.target.closest(".filtro-cidade-check");
  if (!chk) return;
  if (chk.checked) cidadesSelecionadas.add(chk.value);
  else cidadesSelecionadas.delete(chk.value);
  atualizarBotaoFiltroCidade();
  renderDisponiveis();
});

function renderDisponiveis() {
  const el = document.getElementById("lista-disponiveis");
  const compradorFiltro = document.getElementById("filtro-comprador").value;
  const fornecedorFiltro = document.getElementById("filtro-fornecedor").value;
  let data = disponiveisCache.filter((p) => !p.retirar_transportadora);
  if (cidadesSelecionadas.size > 0) data = data.filter((p) => cidadesSelecionadas.has(extrairCidade(p.local_retirada)));
  if (compradorFiltro) data = data.filter((p) => p.comprador_nome === compradorFiltro);
  if (fornecedorFiltro) data = data.filter((p) => p.fornecedor_nome === fornecedorFiltro);

  const totalEl = document.getElementById("total-disponiveis");
  totalEl.textContent = `${data.length} pedido${data.length === 1 ? "" : "s"}`;

  if (!data.length) {
    el.innerHTML = `<p class="empty-state">${
      disponiveisCache.length ? "Nenhum pedido pendente com esse filtro." : "Nenhum pedido pendente no momento."
    }</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa não informada")}</strong>
        ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
        ${p.parcial_esperado ? `<span class="badge parcial">📦 Pode vir parcial</span>` : ""}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">🏢 ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      <div class="card-meta">Comprador: ${escapeHtml(p.comprador_nome)} · ${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` · Nº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      ${p.local_retirada ? `<div class="card-meta">📍 ${escapeHtml(p.local_retirada)}</div>` : ""}
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">📎 ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      <label class="selecionar"><input type="checkbox" class="pedido-check" data-id="${p.id}"> Incluir na rota</label>
      <label class="selecionar"><input type="checkbox" class="toggle-urgente" data-id="${p.id}" ${p.urgente ? "checked" : ""}> Urgente</label>
      <label class="selecionar"><input type="checkbox" class="toggle-parcial" data-id="${p.id}" ${p.parcial_esperado ? "checked" : ""}> 📦 Pode vir parcial</label>
      <button class="link-btn danger" data-cancelar-disponivel="${p.id}" type="button">Excluir pedido</button>
    </div>`
    )
    .join("");
}

document.getElementById("filtro-comprador").addEventListener("change", renderDisponiveis);
document.getElementById("filtro-fornecedor").addEventListener("change", renderDisponiveis);
document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
  cidadesSelecionadas.clear();
  document.getElementById("filtro-comprador").value = "";
  document.getElementById("filtro-fornecedor").value = "";
  document.querySelectorAll(".filtro-cidade-check").forEach((c) => (c.checked = false));
  atualizarBotaoFiltroCidade();
  renderDisponiveis();
});

// ---------- motorista: retirada em transportadora (sem rota fixa — o
// motorista passa lá todo dia sem saber de antemão o que já chegou, então
// aqui ele conclui direto, sem passar pelo fluxo de "montar rota") ----------
function renderTransportadora() {
  const el = document.getElementById("lista-transportadora");
  const data = disponiveisCache.filter((p) => p.retirar_transportadora);

  if (!data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido aguardando retirada em transportadora.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa não informada")}</strong>
        ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
        ${p.parcial_esperado ? `<span class="badge parcial">📦 Pode vir parcial</span>` : ""}
      </div>
      ${p.fornecedor_nome ? `<div class="card-fornecedor">🏢 ${escapeHtml(p.fornecedor_nome)}</div>` : ""}
      <div class="card-meta">Comprador: ${escapeHtml(p.comprador_nome)} · ${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` · Nº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">📎 ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      <label class="selecionar"><input type="checkbox" class="toggle-urgente" data-id="${p.id}" ${p.urgente ? "checked" : ""}> Urgente</label>
      <label class="selecionar"><input type="checkbox" class="toggle-parcial" data-id="${p.id}" ${p.parcial_esperado ? "checked" : ""}> 📦 Pode vir parcial</label>
      <button class="btn primary small" type="button" data-concluir-transportadora="${p.id}">📦 Encontrei — concluir</button>
      <button class="link-btn danger" data-cancelar-disponivel="${p.id}" type="button">Excluir pedido</button>
    </div>`
    )
    .join("");
}

document.getElementById("lista-transportadora").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-concluir-transportadora]");
  if (!btn) return;
  const motoristaNome = document.getElementById("motorista-select").value;
  if (!motoristaNome) return mostrarAviso("Selecione seu nome (motorista) primeiro.");
  const pedidoId = btn.dataset.concluirTransportadora;
  btn.disabled = true;
  try {
    const rotaId = await getOrCreateRotaAtiva(motoristaNome);
    const baseOrdem = paradasCache.length;
    const { error: errParada } = await db.from("rl_rota_paradas").insert({ rota_id: rotaId, pedido_id: pedidoId, ordem: baseOrdem });
    if (errParada) throw errParada;
    const { error: errPedido } = await db.from("rl_pedidos").update({ status: "na_rota" }).eq("id", pedidoId);
    if (errPedido) throw errPedido;

    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
    const parada = paradasCache.find((p) => p.pedido_id === pedidoId);
    if (parada) abrirModalConcluir(parada);
  } catch (err) {
    mostrarAviso("Erro: " + err.message);
    btn.disabled = false;
  }
});

document.getElementById("btn-atualizar-transportadora").addEventListener("click", loadDisponiveis);

// mesmo padrão de confirmação por duplo clique usado em "Meus pedidos" —
// compartilhado entre "Pedidos disponíveis" e "Retirada em transportadora".
async function excluirPedidoDisponivelClick(e) {
  const btn = e.target.closest("button[data-cancelar-disponivel]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir pedido";
    }, 4000);
    return;
  }
  await db.from("rl_pedidos").update({ status: "cancelado" }).eq("id", btn.dataset.cancelarDisponivel);
  loadDisponiveis();
}
document.getElementById("lista-disponiveis").addEventListener("click", excluirPedidoDisponivelClick);
document.getElementById("lista-transportadora").addEventListener("click", excluirPedidoDisponivelClick);

// Urgente/parcial marcados aqui (não no formulário de anexar) porque a
// maioria dos pedidos chega pelo robô, sem ninguém preenchendo formulário.
async function toggleUrgentePartialChange(e) {
  const chkUrgente = e.target.closest("input.toggle-urgente");
  const chkParcial = e.target.closest("input.toggle-parcial");
  if (chkUrgente) {
    await db.from("rl_pedidos").update({ urgente: chkUrgente.checked }).eq("id", chkUrgente.dataset.id);
    await loadDisponiveis();
  }
  if (chkParcial) {
    await db.from("rl_pedidos").update({ parcial_esperado: chkParcial.checked }).eq("id", chkParcial.dataset.id);
    await loadDisponiveis();
  }
}
document.getElementById("lista-disponiveis").addEventListener("change", toggleUrgentePartialChange);
document.getElementById("lista-transportadora").addEventListener("change", (e) => {
  toggleUrgentePartialChange(e);
});

document.getElementById("btn-montar-rota").addEventListener("click", async () => {
  const motoristaNome = document.getElementById("motorista-select").value;
  if (!motoristaNome) return mostrarAviso("Selecione seu nome (motorista) primeiro.");
  const ids = Array.from(document.querySelectorAll(".pedido-check:checked")).map((c) => c.dataset.id);
  if (!ids.length) return mostrarAviso("Selecione ao menos um pedido.");

  const btn = document.getElementById("btn-montar-rota");
  btn.disabled = true;
  try {
    const rotaId = await getOrCreateRotaAtiva(motoristaNome);
    const baseOrdem = paradasCache.length;
    const novasParadas = ids.map((pedido_id, i) => ({ rota_id: rotaId, pedido_id, ordem: baseOrdem + i }));
    const { error: errParadas } = await db.from("rl_rota_paradas").insert(novasParadas);
    if (errParadas) throw errParadas;

    const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "na_rota" }).in("id", ids);
    if (errPedidos) throw errPedidos;

    await loadDisponiveis();
    await loadRotaAtual();
  } catch (err) {
    mostrarAviso("Erro ao montar rota: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- motorista: rota do dia ----------
let rotaAtualId = null;
let paradasCache = [];
let dragIndex = null;
let paradaEmEdicao = null;
let cidadesSelecionadasRota = new Set();

function atualizarBotaoFiltroCidadeRota() {
  const btn = document.getElementById("btn-filtro-cidade-rota");
  if (cidadesSelecionadasRota.size === 0) btn.textContent = "Todas as cidades";
  else if (cidadesSelecionadasRota.size === 1) btn.textContent = [...cidadesSelecionadasRota][0];
  else btn.textContent = `${cidadesSelecionadasRota.size} cidades ▾`;
}

document.getElementById("btn-filtro-cidade-rota").addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("opcoes-filtro-cidade-rota").classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".filtro-multiplo")) document.getElementById("opcoes-filtro-cidade-rota").classList.add("hidden");
});
document.getElementById("opcoes-filtro-cidade-rota").addEventListener("change", (e) => {
  const chk = e.target.closest(".filtro-cidade-check-rota");
  if (!chk) return;
  if (chk.checked) cidadesSelecionadasRota.add(chk.value);
  else cidadesSelecionadasRota.delete(chk.value);
  atualizarBotaoFiltroCidadeRota();
  renderRota();
});
document.getElementById("filtro-comprador-rota").addEventListener("change", renderRota);
document.getElementById("filtro-fornecedor-rota").addEventListener("change", renderRota);
document.getElementById("btn-limpar-filtros-rota").addEventListener("click", () => {
  cidadesSelecionadasRota.clear();
  document.getElementById("filtro-comprador-rota").value = "";
  document.getElementById("filtro-fornecedor-rota").value = "";
  document.querySelectorAll(".filtro-cidade-check-rota").forEach((c) => (c.checked = false));
  atualizarBotaoFiltroCidadeRota();
  renderRota();
});

async function getOrCreateRotaAtiva(motoristaNome) {
  if (rotaAtualId) return rotaAtualId;
  const { data } = await comTimeout(
    db.from("rl_rotas").select("*").eq("motorista_nome", motoristaNome).eq("status", "em_andamento").order("criado_em", { ascending: false }).limit(1)
  );
  if (data && data.length) {
    rotaAtualId = data[0].id;
    return rotaAtualId;
  }
  const { data: nova, error } = await db.from("rl_rotas").insert({ motorista_nome: motoristaNome }).select().single();
  if (error) throw error;
  rotaAtualId = nova.id;
  return rotaAtualId;
}

// paradasCache guarda só as paradas AINDA PENDENTES da rota atual — assim
// que uma parada é concluída, ela sai daqui e some da tela "Minha rota de
// hoje" (vai aparecer no Histórico). O contador de progresso usa uma
// contagem à parte, já que as concluídas não ficam mais no array.
let rotaProgresso = { concluidas: 0, total: 0 };

async function loadRotaAtual() {
  const motoristaNome = document.getElementById("motorista-select").value;
  const progresso = document.getElementById("rota-progresso");
  const lista = document.getElementById("lista-rota");
  if (!motoristaNome) {
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Selecione seu nome acima.</li>`;
    return;
  }
  const { data: rotas } = await comTimeout(
    db.from("rl_rotas").select("*").eq("motorista_nome", motoristaNome).eq("status", "em_andamento").order("criado_em", { ascending: false }).limit(1)
  );
  const btnExcluir = document.getElementById("btn-excluir-rota");
  const btnExcluirSelecionadas = document.getElementById("btn-excluir-selecionadas");
  if (!rotas || !rotas.length) {
    rotaAtualId = null;
    paradasCache = [];
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma rota em andamento. Selecione pedidos acima e clique em "Montar rota".</li>`;
    btnExcluir.classList.add("hidden");
    btnExcluirSelecionadas.classList.add("hidden");
    document.getElementById("btn-abrir-maps").classList.add("hidden");
    return;
  }
  rotaAtualId = rotas[0].id;
  btnExcluir.classList.remove("hidden");

  const { data: todasParadas } = await comTimeout(db.from("rl_rota_paradas").select("id, status").eq("rota_id", rotaAtualId));
  rotaProgresso = {
    total: (todasParadas || []).length,
    concluidas: (todasParadas || []).filter((p) => p.status === "concluida").length,
  };

  const { data: paradas, error } = await comTimeout(
    db.from("rl_rota_paradas").select("*, rl_pedidos(*)").eq("rota_id", rotaAtualId).eq("status", "pendente").order("ordem")
  );
  if (error) {
    lista.innerHTML = `<li class="empty-state">Erro ao carregar rota.</li>`;
    return;
  }
  paradasCache = paradas || [];

  const cidadesRota = [
    ...new Set(paradasCache.map((p) => extrairCidade((p.rl_pedidos || {}).local_retirada)).filter(Boolean)),
  ].sort();
  cidadesSelecionadasRota = new Set([...cidadesSelecionadasRota].filter((c) => cidadesRota.includes(c)));
  document.getElementById("opcoes-filtro-cidade-rota").innerHTML = cidadesRota
    .map(
      (c) => `
    <label class="filtro-multiplo-item">
      <input type="checkbox" class="filtro-cidade-check-rota" value="${escapeHtml(c)}" ${cidadesSelecionadasRota.has(c) ? "checked" : ""}>
      ${escapeHtml(c)}
    </label>`
    )
    .join("");
  atualizarBotaoFiltroCidadeRota();

  const selCompradorRota = document.getElementById("filtro-comprador-rota");
  const compradorRotaAtual = selCompradorRota.value;
  const compradoresRota = [...new Set(paradasCache.map((p) => (p.rl_pedidos || {}).comprador_nome).filter(Boolean))].sort();
  selCompradorRota.innerHTML =
    `<option value="">Todos os compradores</option>` + compradoresRota.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (compradoresRota.includes(compradorRotaAtual)) selCompradorRota.value = compradorRotaAtual;

  const selFornecedorRota = document.getElementById("filtro-fornecedor-rota");
  const fornecedorRotaAtual = selFornecedorRota.value;
  const fornecedoresRota = [...new Set(paradasCache.map((p) => (p.rl_pedidos || {}).fornecedor_nome).filter(Boolean))].sort();
  selFornecedorRota.innerHTML =
    `<option value="">Todos os fornecedores</option>` + fornecedoresRota.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join("");
  if (fornecedoresRota.includes(fornecedorRotaAtual)) selFornecedorRota.value = fornecedorRotaAtual;

  renderRota();
}

// Paradas ainda pendentes voltam pro estoque de "pedidos disponíveis" (o
// motorista pode ter errado a seleção ou precisa recomeçar). Paradas já
// concluídas (com nota fiscal já registrada) NÃO são mexidas — a coleta já
// aconteceu de verdade, apagar isso destruiria a conferência feita e o
// indicador de "coletados por mês". A rota em si vira "cancelada" (some da
// tela) em vez de apagada, preservando o histórico.
document.getElementById("btn-excluir-rota").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!rotaAtualId) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir rota";
    }, 4000);
    return;
  }
  delete btn.dataset.confirmando;
  btn.disabled = true;
  try {
    const pendentesIds = paradasCache.map((p) => p.pedido_id);
    if (pendentesIds.length) {
      const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "pendente" }).in("id", pendentesIds);
      if (errPedidos) throw errPedidos;
    }
    const { error: errRota } = await db.from("rl_rotas").update({ status: "cancelada" }).eq("id", rotaAtualId);
    if (errRota) throw errRota;

    btn.textContent = "Excluir rota";
    rotaAtualId = null;
    paradasCache = [];
    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
  } catch (err) {
    mostrarAviso("Erro ao excluir rota: " + err.message);
    btn.textContent = "Excluir rota";
  } finally {
    btn.disabled = false;
  }
});

// Remove só as paradas marcadas (o pedido delas volta pra fila de
// disponíveis) — diferente de "Excluir rota", que mexe em todas de uma vez.
document.getElementById("btn-excluir-selecionadas").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const marcadas = Array.from(document.querySelectorAll(".parada-check:checked")).map((c) => c.dataset.paradaId);
  if (!marcadas.length) {
    mostrarAviso("Marque ao menos uma parada pra excluir.");
    return;
  }
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = `Clique de novo pra confirmar (${marcadas.length})`;
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir selecionadas";
    }, 4000);
    return;
  }
  delete btn.dataset.confirmando;
  btn.disabled = true;
  try {
    const paradasSelecionadas = paradasCache.filter((p) => marcadas.includes(String(p.id)));
    const pedidoIds = paradasSelecionadas.map((p) => p.pedido_id);
    if (pedidoIds.length) {
      const { error: errPedidos } = await db.from("rl_pedidos").update({ status: "pendente" }).in("id", pedidoIds);
      if (errPedidos) throw errPedidos;
    }
    const { error: errParadas } = await db.from("rl_rota_paradas").delete().in("id", marcadas);
    if (errParadas) throw errParadas;

    btn.textContent = "Excluir selecionadas";
    await Promise.all([loadDisponiveis(), loadRotaAtual()]);
  } catch (err) {
    mostrarAviso("Erro ao excluir selecionadas: " + err.message);
    btn.textContent = "Excluir selecionadas";
  } finally {
    btn.disabled = false;
  }
});

// Deep link do Google Maps — abre direto no app de navegação do celular,
// sem precisar de nenhuma chave de API. Sem "origin" definido, o próprio
// Maps usa a localização atual do motorista como ponto de partida.
//
// O endereço completo (rua/quadra/lote + bairro + cidade + UF + CEP num
// texto só) às vezes tem termos que o Maps não reconhece — testamos e
// confirmamos que usar só o CEP é bem mais confiável (encontra certo até
// em endereços de quadra/lote de Brasília que o texto completo não achava),
// então preferimos o CEP quando ele existir no texto.
function extrairCEP(local) {
  if (!local) return null;
  const m = local.match(/\d{5}-?\d{3}/);
  return m ? m[0] : null;
}

function enderecoParaMaps(endereco) {
  const cep = extrairCEP(endereco);
  return cep ? `${cep}, Brasil` : endereco;
}

function linkMapsDestino(endereco) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(enderecoParaMaps(endereco))}&travelmode=driving`;
}

function linkMapsRota(enderecos) {
  const convertidos = enderecos.map(enderecoParaMaps);
  const destino = convertidos[convertidos.length - 1];
  const waypoints = convertidos.slice(0, -1);
  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`;
  if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join("|")}`;
  return url;
}

document.getElementById("btn-abrir-maps").addEventListener("click", () => {
  const enderecos = paradasCache.map((p) => (p.rl_pedidos || {}).local_retirada).filter(Boolean);
  if (!enderecos.length) {
    mostrarAviso("Nenhuma parada pendente com endereço cadastrado.");
    return;
  }
  if (enderecos.length > 9) {
    mostrarAviso("O Google Maps só aceita até 9 paradas de uma vez por esse link — abrindo com as 9 primeiras.");
  }
  window.open(linkMapsRota(enderecos.slice(0, 9)), "_blank", "noopener");
});

function renderRota() {
  const progresso = document.getElementById("rota-progresso");
  const lista = document.getElementById("lista-rota");
  const btnExcluirSelecionadas = document.getElementById("btn-excluir-selecionadas");
  const btnAbrirMaps = document.getElementById("btn-abrir-maps");
  btnExcluirSelecionadas.classList.toggle("hidden", !paradasCache.length);
  btnAbrirMaps.classList.toggle("hidden", !paradasCache.length);

  if (!rotaProgresso.total) {
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma parada na rota ainda.</li>`;
    return;
  }
  progresso.textContent = `${rotaProgresso.concluidas} de ${rotaProgresso.total} paradas concluídas.${
    rotaProgresso.concluidas ? " As já concluídas aparecem na aba Histórico." : ""
  }`;

  if (!paradasCache.length) {
    lista.innerHTML = `<li class="empty-state">Todas as paradas desta rota já foram concluídas. Veja o detalhe na aba Histórico.</li>`;
    return;
  }

  const compradorFiltroRota = document.getElementById("filtro-comprador-rota").value;
  const fornecedorFiltroRota = document.getElementById("filtro-fornecedor-rota").value;
  // Mantém o índice ORIGINAL em paradasCache (não a posição no filtro) no
  // data-index, pra arrastar/soltar continuar reordenando a rota de verdade
  // mesmo com o filtro aplicado — só o número mostrado (①②③) é sequencial.
  const visiveis = paradasCache
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => {
      const pedido = p.rl_pedidos || {};
      if (cidadesSelecionadasRota.size > 0 && !cidadesSelecionadasRota.has(extrairCidade(pedido.local_retirada))) return false;
      if (compradorFiltroRota && pedido.comprador_nome !== compradorFiltroRota) return false;
      if (fornecedorFiltroRota && pedido.fornecedor_nome !== fornecedorFiltroRota) return false;
      return true;
    });

  document.getElementById("total-rota").textContent = `${visiveis.length} parada${visiveis.length === 1 ? "" : "s"} nesta rota`;

  if (!visiveis.length) {
    lista.innerHTML = `<li class="empty-state">Nenhuma parada pendente com esse filtro.</li>`;
    return;
  }

  lista.innerHTML = visiveis
    .map(({ p, i }, posicao) => {
      const pedido = p.rl_pedidos || {};
      return `
      <li class="rota-item" draggable="true" data-index="${i}">
        <input type="checkbox" class="parada-check" data-parada-id="${p.id}">
        <span class="drag-handle">⠿</span>
        <span class="ordem-num">${posicao + 1}</span>
        <div class="rota-item-info">
          <strong>${escapeHtml(pedido.empresa_nome || "Empresa não informada")}</strong>
          ${pedido.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
          ${pedido.parcial_esperado ? `<span class="badge parcial">📦 Pode vir parcial</span>` : ""}
          ${pedido.fornecedor_nome ? `<span class="card-fornecedor">🏢 ${escapeHtml(pedido.fornecedor_nome)}</span>` : ""}
          <span>Comprador: ${escapeHtml(pedido.comprador_nome || "—")} · Valor esperado: ${formatarMoeda(pedido.valor_total)}</span>
          ${
            pedido.local_retirada
              ? `<span>📍 ${escapeHtml(pedido.local_retirada)} · <a class="arquivo-link" href="${linkMapsDestino(pedido.local_retirada)}" target="_blank" rel="noopener">Navegar</a></span>`
              : ""
          }
          ${pedido.arquivo_url ? `<a class="arquivo-link" href="${pedido.arquivo_url}" target="_blank" rel="noopener">📎 pedido</a>` : ""}
        </div>
        <button class="btn secondary small" type="button" data-concluir="${p.id}">Concluir</button>
      </li>`;
    })
    .join("");
}

// drag and drop pra reordenar a rota
document.getElementById("lista-rota").addEventListener("dragstart", (e) => {
  const li = e.target.closest(".rota-item");
  if (!li) return;
  dragIndex = Number(li.dataset.index);
  li.classList.add("dragging");
});

document.getElementById("lista-rota").addEventListener("dragend", (e) => {
  e.target.closest(".rota-item")?.classList.remove("dragging");
});

document.getElementById("lista-rota").addEventListener("dragover", (e) => e.preventDefault());

document.getElementById("lista-rota").addEventListener("drop", async (e) => {
  e.preventDefault();
  const li = e.target.closest(".rota-item");
  if (!li || dragIndex == null) return;
  const dropIndex = Number(li.dataset.index);
  if (dragIndex === dropIndex) return;
  const item = paradasCache.splice(dragIndex, 1)[0];
  paradasCache.splice(dropIndex, 0, item);
  dragIndex = null;
  renderRota();
  await Promise.all(paradasCache.map((p, i) => db.from("rl_rota_paradas").update({ ordem: i }).eq("id", p.id)));
});

// ---------- concluir parada (modal com conferência) ----------
function abrirModalConcluir(parada) {
  paradaEmEdicao = parada;
  notaItensExtraidos = null;
  notaTipoDocumento = null;
  notaEmitenteExtraido = null;
  document.getElementById("form-modal-nota").reset();
  // já vem pré-marcado se o comprador/motorista sinalizou antes, em
  // "Pedidos disponíveis", que esse pedido costuma vir em partes.
  document.getElementById("nota-parcial").checked = !!(paradaEmEdicao.rl_pedidos || {}).parcial_esperado;
  document.getElementById("nota-ia-feedback").textContent = "";
  document.getElementById("modal-feedback").textContent = "";
  document.getElementById("conferencia-resultado").classList.add("hidden");
  document.getElementById("modal-overlay").classList.remove("hidden");
}

document.getElementById("lista-rota").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-concluir]");
  if (!btn) return;
  const parada = paradasCache.find((p) => String(p.id) === btn.dataset.concluir);
  if (!parada) return;
  abrirModalConcluir(parada);
});

document.getElementById("btn-modal-fechar").addEventListener("click", () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  paradaEmEdicao = null;
});

let notaItensExtraidos = null;
let notaTipoDocumento = null;
let notaEmitenteExtraido = null;

document.getElementById("btn-ler-nota").addEventListener("click", async () => {
  const input = document.getElementById("nota-arquivo");
  const feedback = document.getElementById("nota-ia-feedback");
  const file = input.files && input.files[0];
  if (!file) {
    feedback.textContent = "Selecione/tire a foto da nota primeiro.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Lendo nota com IA...";
  feedback.className = "feedback";
  try {
    const extraido = await lerComIA(file, "nota");
    if (extraido.valor_total != null) document.getElementById("nota-valor").value = extraido.valor_total;
    if (extraido.destinatario_cnpj) document.getElementById("nota-cnpj").value = extraido.destinatario_cnpj;
    if (extraido.numero_nota) document.getElementById("nota-numero").value = extraido.numero_nota;
    notaItensExtraidos = Array.isArray(extraido.itens) && extraido.itens.length ? extraido.itens : null;
    notaTipoDocumento = extraido.tipo_documento || null;
    notaEmitenteExtraido = extraido.emitente_nome || null;
    feedback.textContent =
      notaTipoDocumento === "servico"
        ? "Nota de serviço lida. Confira o tomador, a prestadora e o valor abaixo."
        : "Nota lida. Confira os valores abaixo.";
    feedback.className = "feedback success";
    atualizarConferencia();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

// Casa os itens do pedido com os da nota pelo nome do produto (a ordem pode
// mudar de um documento pro outro). Tenta igualdade exata primeiro, depois
// um item "conter" o outro (nomes costumam variar um pouco entre pedido e
// nota do mesmo produto).
function normalizarProduto(nome) {
  return String(nome || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function compararItens(pedidoItens, notaItens) {
  pedidoItens = Array.isArray(pedidoItens) ? pedidoItens : [];
  notaItens = Array.isArray(notaItens) ? notaItens : [];
  if (!pedidoItens.length || !notaItens.length) return { temDados: false, divergente: false, linhas: [] };

  const restantes = notaItens.map((it) => ({ ...it, usado: false }));
  const mesmaQuantidadeDeLinhas = pedidoItens.length === notaItens.length;

  // 1ª tentativa: nome igual ou um contendo o outro. Nomes costumam variar
  // entre o pedido (ERP do comprador) e a nota (do fornecedor) — quando as
  // duas listas têm o mesmo número de linhas, usa a posição como reforço
  // pra quem não deu match por nome (bem mais provável de estar certo do
  // que deixar "não encontrado" por causa só do texto ser diferente).
  const pedidoComMatch = pedidoItens.map((pItem, idx) => {
    const nomeP = normalizarProduto(pItem.produto_nome);
    let match =
      restantes.find((n) => !n.usado && normalizarProduto(n.produto_nome) === nomeP) ||
      restantes.find(
        (n) => !n.usado && nomeP && (normalizarProduto(n.produto_nome).includes(nomeP) || nomeP.includes(normalizarProduto(n.produto_nome)))
      );
    if (!match && mesmaQuantidadeDeLinhas && !restantes[idx].usado) match = restantes[idx];
    if (match) match.usado = true;
    return { pItem, match };
  });

  let divergente = false;
  const linhas = pedidoComMatch.map(({ pItem, match }) => {
    const qtdOk = match && pItem.quantidade != null && match.quantidade != null ? Math.abs(pItem.quantidade - match.quantidade) < 0.01 : null;
    const vuOk =
      match && pItem.valor_unitario != null && match.valor_unitario != null
        ? Math.abs(pItem.valor_unitario - match.valor_unitario) <= TOLERANCIA_VALOR
        : null;

    const linhaDivergente = !match || qtdOk === false || vuOk === false;
    if (linhaDivergente) divergente = true;

    return {
      produto: pItem.produto_nome,
      qtdP: pItem.quantidade,
      qtdN: match ? match.quantidade : null,
      vuP: pItem.valor_unitario,
      vuN: match ? match.valor_unitario : null,
      match: !!match,
      divergente: linhaDivergente,
    };
  });
  return { temDados: true, divergente, linhas };
}

function renderTabelaItens(resultado) {
  if (!resultado.temDados) return "";
  const linhas = resultado.linhas
    .map(
      (l) => `
    <tr class="${l.divergente ? "linha-divergente" : ""}">
      <td>${escapeHtml(l.produto)}</td>
      <td>${l.qtdP ?? "—"}</td>
      <td>${l.match ? l.qtdN ?? "—" : "não encontrado"}</td>
      <td>${formatarMoeda(l.vuP)}</td>
      <td>${l.match ? formatarMoeda(l.vuN) : "—"}</td>
      <td>${l.divergente ? "⚠️" : "✅"}</td>
    </tr>`
    )
    .join("");
  return `
    <table class="tabela-itens">
      <thead><tr><th>Produto</th><th>Qtd. pedido</th><th>Qtd. nota</th><th>Vl. Unit. pedido</th><th>Vl. Unit. nota</th><th></th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`;
}

document.getElementById("nota-valor").addEventListener("input", atualizarConferencia);
document.getElementById("nota-cnpj").addEventListener("input", atualizarConferencia);
document.getElementById("nota-parcial").addEventListener("change", atualizarConferencia);

function calcularDivergencias() {
  const pedido = (paradaEmEdicao && paradaEmEdicao.rl_pedidos) || {};
  const notaValor = document.getElementById("nota-valor").value;
  const notaCnpj = document.getElementById("nota-cnpj").value;

  let msgValor, divergValor;
  if (pedido.valor_total == null) {
    msgValor = "Valor esperado não informado no pedido — não é possível conferir.";
    divergValor = false;
  } else if (!notaValor) {
    msgValor = "Informe o valor da nota pra conferir.";
    divergValor = false;
  } else if (Math.abs(Number(pedido.valor_total) - Number(notaValor)) <= TOLERANCIA_VALOR) {
    msgValor = `✅ Valor confere (${formatarMoeda(notaValor)}).`;
    divergValor = false;
  } else {
    msgValor = `⚠️ Divergência de valor: pedido ${formatarMoeda(pedido.valor_total)} vs nota ${formatarMoeda(notaValor)}.`;
    divergValor = true;
  }

  const cnpjEsperado = apenasDigitos(pedido.empresa_cnpj);
  const cnpjNota = apenasDigitos(notaCnpj);
  let msgCnpj, divergCnpj;
  if (!cnpjEsperado) {
    msgCnpj = "CNPJ da empresa compradora não informado no pedido — não é possível conferir.";
    divergCnpj = false;
  } else if (!cnpjNota) {
    msgCnpj = "Informe o CNPJ da nota pra conferir.";
    divergCnpj = false;
  } else if (cnpjEsperado === cnpjNota) {
    msgCnpj = "✅ CNPJ confere.";
    divergCnpj = false;
  } else {
    msgCnpj = `⚠️ CNPJ diferente: pedido esperava ${escapeHtml(pedido.empresa_cnpj)} (${escapeHtml(
      pedido.empresa_nome || ""
    )}), nota informa ${escapeHtml(notaCnpj)}.`;
    divergCnpj = true;
  }

  return { msgValor, divergValor, msgCnpj, divergCnpj };
}

// Nome de empresa varia de documento pra documento no sufixo jurídico (ex:
// "GRAFICA FORMOSA LTDA" no pedido vs "GRAFICA FORMOSA EIRELI ME" na nota,
// mesma empresa) — remove esses sufixos antes de comparar pra não acusar
// divergência falsa por causa só disso.
function normalizarEmpresa(nome) {
  return normalizarProduto(nome)
    .replace(/\b(ltda|me|epp|eireli|s\/?a|mei)\b\.?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Nota de serviço (NFS-e) não tem tabela de itens de verdade pra comparar —
// em vez disso, confere se a empresa prestadora bate com o fornecedor
// registrado no pedido (comparação de nome, não tem CNPJ do fornecedor
// guardado no pedido pra comparar dígito a dígito).
function compararPrestador(pedido, emitenteNome) {
  const esperado = normalizarEmpresa(pedido.fornecedor_nome);
  if (!esperado) return { msgPrestador: "Fornecedor não informado no pedido — não é possível conferir.", divergPrestador: false };
  if (!emitenteNome) return { msgPrestador: "Não foi possível ler a prestadora na nota.", divergPrestador: false };
  const lido = normalizarEmpresa(emitenteNome);
  const bate = lido === esperado || lido.includes(esperado) || esperado.includes(lido);
  return bate
    ? { msgPrestador: `✅ Prestadora confere (${escapeHtml(emitenteNome)}).`, divergPrestador: false }
    : {
        msgPrestador: `⚠️ Prestadora diferente: pedido esperava ${escapeHtml(pedido.fornecedor_nome)}, nota informa ${escapeHtml(emitenteNome)}.`,
        divergPrestador: true,
      };
}

function atualizarConferencia() {
  if (!paradaEmEdicao) return;
  const box = document.getElementById("conferencia-resultado");

  // Entrega parcial nunca vai bater com o total do pedido — não faz sentido
  // (nem é justo com o motorista) rodar a conferência nesse caso. A
  // conferência de verdade só acontece quando a entrega for marcada completa.
  if (document.getElementById("nota-parcial").checked) {
    box.classList.remove("hidden", "warn");
    box.classList.add("ok");
    box.innerHTML = `<div>📦 Entrega parcial — a conferência de valor/itens só é feita quando o pedido for concluído por completo.</div>`;
    return;
  }

  const { msgValor, divergValor, msgCnpj, divergCnpj } = calcularDivergencias();
  const pedido = paradaEmEdicao.rl_pedidos || {};

  // Nota de serviço (NFS-e) não tem itens de verdade pra comparar — confere
  // só tomador (CNPJ, já incluso acima), prestadora e valor total.
  if (notaTipoDocumento === "servico") {
    const { msgPrestador, divergPrestador } = compararPrestador(pedido, notaEmitenteExtraido);
    box.classList.remove("hidden", "ok", "warn");
    box.classList.add(divergValor || divergCnpj || divergPrestador ? "warn" : "ok");
    box.innerHTML = `<div>📄 Nota de serviço.</div><div>${msgValor}</div><div>${msgCnpj}</div><div>${msgPrestador}</div>`;
    return;
  }

  const resultadoItens = compararItens(pedido.itens, notaItensExtraidos);

  box.classList.remove("hidden", "ok", "warn");
  box.classList.add(divergValor || divergCnpj || resultadoItens.divergente ? "warn" : "ok");
  let html = `<div>${msgValor}</div><div>${msgCnpj}</div>`;
  if (resultadoItens.temDados) {
    html += `<div>${resultadoItens.divergente ? "⚠️ Divergência nos itens (veja a tabela abaixo)." : "✅ Itens conferem."}</div>`;
    html += renderTabelaItens(resultadoItens);
  } else if (!pedido.itens) {
    html += `<div class="muted">Pedido não tem lista de itens registrada — não é possível conferir item a item.</div>`;
  }
  box.innerHTML = html;
}

document.getElementById("form-modal-nota").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!paradaEmEdicao) return;
  const feedback = document.getElementById("modal-feedback");
  const file = document.getElementById("nota-arquivo").files[0];
  if (!file) {
    feedback.textContent = "Anexe a foto da nota fiscal.";
    feedback.className = "feedback error";
    return;
  }
  feedback.textContent = "Salvando...";
  feedback.className = "feedback";
  try {
    const { url } = await uploadArquivo(file, "rl_notas");
    const entregaParcial = document.getElementById("nota-parcial").checked;
    const notaValor = document.getElementById("nota-valor").value;
    const notaCnpj = document.getElementById("nota-cnpj").value.trim();
    const notaNumero = document.getElementById("nota-numero").value.trim();

    // Entrega parcial não passa pela conferência (o valor/itens dessa nota
    // não deve mesmo bater com o total do pedido) e o pedido volta pra fila
    // de disponíveis pra uma próxima rota buscar o restante.
    let divergValor = false;
    let divergCnpj = false;
    let itensDivergentes = false;
    if (!entregaParcial) {
      ({ divergValor, divergCnpj } = calcularDivergencias());
      // Nota de serviço não tem itens de verdade pra comparar — a divergência
      // de "itens" nesse caso vira divergência de prestadora (fornecedor).
      if (notaTipoDocumento === "servico") {
        itensDivergentes = compararPrestador(paradaEmEdicao.rl_pedidos || {}, notaEmitenteExtraido).divergPrestador;
      } else {
        itensDivergentes = compararItens((paradaEmEdicao.rl_pedidos || {}).itens, notaItensExtraidos).divergente;
      }
    }

    const { error: errParada } = await db
      .from("rl_rota_paradas")
      .update({
        status: "concluida",
        nota_arquivo_url: url,
        nota_numero: notaNumero || null,
        nota_valor_total: notaValor ? Number(notaValor) : null,
        nota_cnpj: notaCnpj || null,
        nota_itens: notaItensExtraidos,
        nota_tipo_documento: notaTipoDocumento,
        nota_emitente_nome: notaEmitenteExtraido,
        entrega_parcial: entregaParcial,
        divergencia_valor: divergValor,
        divergencia_cnpj: divergCnpj,
        divergencia_itens: itensDivergentes,
        concluido_em: new Date().toISOString(),
      })
      .eq("id", paradaEmEdicao.id);
    if (errParada) throw errParada;

    const { error: errPedido } = await db
      .from("rl_pedidos")
      .update({ status: entregaParcial ? "pendente" : "concluido" })
      .eq("id", paradaEmEdicao.pedido_id);
    if (errPedido) throw errPedido;

    const { data: pendentes } = await db.from("rl_rota_paradas").select("id").eq("rota_id", rotaAtualId).eq("status", "pendente");
    if (!pendentes || !pendentes.length) {
      await db.from("rl_rotas").update({ status: "concluida" }).eq("id", rotaAtualId);
    }

    document.getElementById("modal-overlay").classList.add("hidden");
    paradaEmEdicao = null;
    await Promise.all([loadRotaAtual(), entregaParcial ? loadDisponiveis() : Promise.resolve()]);
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

// ---------- configurações ----------
document.getElementById("form-empresa").addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("empresa-nome").value.trim();
  const cnpj = document.getElementById("empresa-cnpj").value.trim();
  if (!nome) return;
  const { error } = await db.from("rl_empresas").insert({ nome, cnpj: cnpj || null });
  if (error) return mostrarAviso("Erro ao cadastrar: " + error.message);
  document.getElementById("form-empresa").reset();
  await loadEmpresas();
  renderCadastros();
});

function renderCadastros() {
  const listaEmpresas = document.getElementById("lista-empresas");
  listaEmpresas.innerHTML = empresasCache.length
    ? empresasCache
        .map(
          (emp) => `
      <li class="${emp.ativo ? "" : "inativo"}">
        <span>${escapeHtml(emp.nome)}${emp.cnpj ? ` <span class="cadastro-meta">— ${escapeHtml(emp.cnpj)}</span>` : ""}</span>
        <button class="link-btn" data-toggle-empresa="${emp.id}" data-ativo="${emp.ativo}" type="button">${emp.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhuma empresa cadastrada.</li>`;

  const listaCompradores = document.getElementById("lista-compradores-config");
  listaCompradores.innerHTML = compradoresCache.length
    ? compradoresCache
        .map(
          (c) => `
      <li class="${c.ativo ? "" : "inativo"}">
        <span>${escapeHtml(c.nome)}</span>
        <input type="tel" inputmode="tel" class="input-telefone" data-telefone-comprador="${c.id}" placeholder="WhatsApp (opcional)" value="${escapeHtml(c.telefone || "")}">
        <button class="link-btn" data-toggle-comprador="${c.id}" data-ativo="${c.ativo}" type="button">${c.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhum comprador cadastrado.</li>`;

  const listaMotoristas = document.getElementById("lista-motoristas-config");
  listaMotoristas.innerHTML = motoristasCache.length
    ? motoristasCache
        .map(
          (m) => `
      <li class="${m.ativo ? "" : "inativo"}">
        <span>${escapeHtml(m.nome)}</span>
        <button class="link-btn" data-toggle-motorista="${m.id}" data-ativo="${m.ativo}" type="button">${m.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhum motorista cadastrado.</li>`;

  const listaAlmoxarifes = document.getElementById("lista-almoxarifes-config");
  listaAlmoxarifes.innerHTML = almoxarifesCache.length
    ? almoxarifesCache
        .map(
          (a) => `
      <li class="${a.ativo ? "" : "inativo"}">
        <span>${escapeHtml(a.nome)}</span>
        <button class="link-btn" data-toggle-almoxarife="${a.id}" data-ativo="${a.ativo}" type="button">${a.ativo ? "Desativar" : "Ativar"}</button>
      </li>`
        )
        .join("")
    : `<li class="empty-state">Nenhum almoxarife cadastrado.</li>`;
}

document.getElementById("tab-config").addEventListener("click", async (e) => {
  const btnEmp = e.target.closest("button[data-toggle-empresa]");
  const btnComp = e.target.closest("button[data-toggle-comprador]");
  const btnMot = e.target.closest("button[data-toggle-motorista]");
  const btnAlm = e.target.closest("button[data-toggle-almoxarife]");
  // Sem isso, QUALQUER clique dentro de Configurações (até só focar o campo
  // de telefone) redesenhava a lista inteira e destruía o campo, fazendo
  // parecer que só dava pra digitar segurando o botão do mouse pressionado.
  if (!btnEmp && !btnComp && !btnMot && !btnAlm) return;

  if (btnEmp) {
    await db.from("rl_empresas").update({ ativo: btnEmp.dataset.ativo !== "true" }).eq("id", btnEmp.dataset.toggleEmpresa);
    await loadEmpresas();
  }
  if (btnComp) {
    await db.from("rl_compradores").update({ ativo: btnComp.dataset.ativo !== "true" }).eq("id", btnComp.dataset.toggleComprador);
    await loadCompradores();
  }
  if (btnMot) {
    await db.from("rl_motoristas").update({ ativo: btnMot.dataset.ativo !== "true" }).eq("id", btnMot.dataset.toggleMotorista);
    await loadMotoristas();
  }
  if (btnAlm) {
    await db.from("rl_almoxarifes").update({ ativo: btnAlm.dataset.ativo !== "true" }).eq("id", btnAlm.dataset.toggleAlmoxarife);
    await loadAlmoxarifes();
  }
  renderCadastros();
});

// salva o telefone ao sair do campo (sem botão de salvar separado)
document.getElementById("tab-config").addEventListener(
  "blur",
  async (e) => {
    const input = e.target.closest("input[data-telefone-comprador]");
    if (!input) return;
    const { error } = await db
      .from("rl_compradores")
      .update({ telefone: input.value.trim() || null })
      .eq("id", input.dataset.telefoneComprador);
    if (error) {
      mostrarAviso("Erro ao salvar telefone: " + error.message);
      return;
    }
    await loadCompradores();
    renderCadastros();
  },
  true
);

// ---------- indicadores ----------
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function chaveAnoMes(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

async function loadIndicadores() {
  const container = document.getElementById("grafico-coletados");
  const { data, error } = await comTimeout(
    db.from("rl_rota_paradas").select("concluido_em").eq("status", "concluida").not("concluido_em", "is", null)
  );
  if (error) {
    container.innerHTML = `<p class="empty-state">Erro ao carregar indicador.</p>`;
    return;
  }

  // últimos 6 meses, incluindo os que tiverem zero coletas
  const hoje = new Date();
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ chave: chaveAnoMes(d), label: `${MESES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, total: 0 });
  }
  const porChave = Object.fromEntries(meses.map((m) => [m.chave, m]));
  (data || []).forEach((p) => {
    const chave = chaveAnoMes(new Date(p.concluido_em));
    if (porChave[chave]) porChave[chave].total++;
  });

  renderGraficoColetados(meses);
}

function renderGraficoColetados(meses) {
  const container = document.getElementById("grafico-coletados");
  const max = Math.max(1, ...meses.map((m) => m.total));
  const larguraBarra = 56;
  const espaco = 28;
  const alturaBarraMax = 160;
  const larguraTotal = meses.length * (larguraBarra + espaco) + espaco;
  const alturaTotal = alturaBarraMax + 56;

  const barras = meses
    .map((m, i) => {
      const x = espaco + i * (larguraBarra + espaco);
      const altura = m.total === 0 ? 0 : Math.max(4, Math.round((m.total / max) * alturaBarraMax));
      const y = alturaBarraMax - altura + 20;
      return `
      <g class="grafico-barra">
        <title>${m.label}: ${m.total} pedido(s) coletado(s)</title>
        <rect x="${x}" y="${y}" width="${larguraBarra}" height="${altura}" rx="4" fill="var(--primary)"></rect>
        <text class="grafico-valor" x="${x + larguraBarra / 2}" y="${y - 6}" text-anchor="middle">${m.total}</text>
        <text class="grafico-mes" x="${x + larguraBarra / 2}" y="${alturaBarraMax + 40}" text-anchor="middle">${m.label}</text>
      </g>`;
    })
    .join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${larguraTotal} ${alturaTotal}" width="100%" style="max-width:${larguraTotal}px">
      <line class="grafico-eixo" x1="0" y1="${alturaBarraMax + 20}" x2="${larguraTotal}" y2="${alturaBarraMax + 20}"></line>
      ${barras}
    </svg>`;
}

// ---------- histórico (rotas concluídas) ----------
// Sem número salvo, "" abre o seletor de contato do próprio WhatsApp (mesmo
// padrão usado no Painel de Operações).
function linkWhatsapp(numero, mensagem) {
  const digitos = String(numero || "").replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// Mesma lógica de renderDivergenciasParada, mas em texto puro (sem HTML)
// pra poder entrar direto na mensagem do WhatsApp.
function resumoDivergenciasTexto(parada) {
  const pedido = parada.rl_pedidos || {};
  const linhas = [];
  if (parada.divergencia_valor) {
    linhas.push(`Valor: pedido esperava ${formatarMoeda(pedido.valor_total)}, nota trouxe ${formatarMoeda(parada.nota_valor_total)}.`);
  }
  if (parada.divergencia_cnpj) {
    linhas.push(`CNPJ: pedido esperava ${pedido.empresa_cnpj || "—"}, nota trouxe ${parada.nota_cnpj || "—"}.`);
  }
  if (parada.divergencia_itens) {
    if (parada.nota_tipo_documento === "servico") {
      linhas.push(
        `Prestadora do serviço: pedido esperava ${pedido.fornecedor_nome || "—"}, nota trouxe ${parada.nota_emitente_nome || "—"}.`
      );
    } else {
      linhas.push("Itens com quantidade ou valor unitário diferente do esperado (confira no sistema).");
    }
  }
  return linhas.join("\n");
}

function linkAvisoComprador(parada) {
  const pedido = parada.rl_pedidos || {};
  const comprador = compradoresCache.find((c) => c.nome === pedido.comprador_nome) || {};
  const mensagem =
    `Olá${pedido.comprador_nome ? " " + pedido.comprador_nome : ""}! Encontramos uma divergência na conferência do pedido ` +
    `${pedido.numero_pedido ? "Nº " + pedido.numero_pedido + " " : ""}(${pedido.empresa_nome || "empresa não informada"}):\n` +
    resumoDivergenciasTexto(parada) +
    "\n\nPode conferir com o fornecedor?";
  return linkWhatsapp(comprador.telefone, mensagem);
}

// Manda pro comprador a observação que o almoxarifado deixou na conferência
// do recebimento (ex: avaria, embalagem violada, quantidade a menos).
function linkAvisoObservacaoRecebimento(parada) {
  const pedido = parada.rl_pedidos || {};
  const comprador = compradoresCache.find((c) => c.nome === pedido.comprador_nome) || {};
  const mensagem =
    `Olá${pedido.comprador_nome ? " " + pedido.comprador_nome : ""}! O almoxarifado deixou uma observação na conferência do ` +
    `pedido ${pedido.numero_pedido ? "Nº " + pedido.numero_pedido + " " : ""}(${pedido.empresa_nome || "empresa não informada"}):\n\n` +
    `"${parada.recebido_observacao}"`;
  return linkWhatsapp(comprador.telefone, mensagem);
}

// Reconstrói as mensagens de divergência a partir do que já ficou salvo na
// parada (nota_valor_total, nota_cnpj, nota_itens) — não depende de nada
// que só existia na tela no momento em que o motorista concluiu a parada.
function renderDivergenciasParada(parada) {
  const pedido = parada.rl_pedidos || {};
  let html = "";
  if (parada.divergencia_valor) {
    html += `<div>⚠️ Valor: pedido esperava ${formatarMoeda(pedido.valor_total)}, nota trouxe ${formatarMoeda(parada.nota_valor_total)}.</div>`;
  }
  if (parada.divergencia_cnpj) {
    html += `<div>⚠️ CNPJ: pedido esperava ${escapeHtml(pedido.empresa_cnpj || "—")}, nota trouxe ${escapeHtml(parada.nota_cnpj || "—")}.</div>`;
  }
  if (parada.divergencia_itens) {
    if (parada.nota_tipo_documento === "servico") {
      html += `<div>⚠️ Prestadora do serviço: pedido esperava ${escapeHtml(pedido.fornecedor_nome || "—")}, nota trouxe ${escapeHtml(
        parada.nota_emitente_nome || "—"
      )}.</div>`;
    } else {
      const resultadoItens = compararItens(pedido.itens, parada.nota_itens);
      html += `<div>⚠️ Itens divergentes:</div>${renderTabelaItens(resultadoItens)}`;
    }
  }
  return html;
}

// Lista achatada de PARADAS concluídas (não agrupada por rota) — assim uma
// parada aparece aqui assim que é concluída, sem esperar a rota inteira
// terminar (rotas costumam levar o dia todo).
let historicoCache = [];

function renderHistorico() {
  const el = document.getElementById("lista-historico");
  const empresaFiltro = document.getElementById("filtro-empresa-historico").value;
  const paradas = empresaFiltro
    ? historicoCache.filter((p) => (p.rl_pedidos || {}).empresa_nome === empresaFiltro)
    : historicoCache;

  if (!paradas.length) {
    el.innerHTML = `<p class="empty-state">${
      historicoCache.length ? "Nenhuma parada concluída dessa empresa." : "Nenhuma parada concluída ainda."
    }</p>`;
    return;
  }
  el.innerHTML = paradas
    .map((p) => {
      const pedido = p.rl_pedidos || {};
      const motorista = (p.rl_rotas || {}).motorista_nome || "—";
      const divergente = p.divergencia_valor || p.divergencia_cnpj || p.divergencia_itens;
      const status = p.entrega_parcial ? "📦 Entrega parcial" : divergente ? "⚠️ Divergência" : "✅ OK";
      return `
      <div class="card-pedido historico-parada-card">
        <div class="card-pedido-head">
          <strong>${escapeHtml(pedido.empresa_nome || "Empresa não informada")}</strong>
          <span>${status}</span>
        </div>
        ${pedido.fornecedor_nome ? `<div class="card-fornecedor">🏢 ${escapeHtml(pedido.fornecedor_nome)}</div>` : ""}
        <div class="card-meta">
          ${pedido.numero_pedido ? `Nº ${escapeHtml(pedido.numero_pedido)} · ` : ""}Comprador: ${escapeHtml(pedido.comprador_nome || "—")}
          · Motorista: ${escapeHtml(motorista)} · Concluído em ${formatarDataHora(p.concluido_em)}
        </div>
        ${pedido.arquivo_url ? `<a class="arquivo-link" href="${pedido.arquivo_url}" target="_blank" rel="noopener">📎 pedido</a>` : ""}
        ${p.nota_arquivo_url ? `<a class="arquivo-link" href="${p.nota_arquivo_url}" target="_blank" rel="noopener">📎 nota fiscal</a>` : ""}
        ${
          p.entrega_parcial
            ? `<div class="conferencia-box ok">📦 Entrega parcial — o pedido voltou pra fila de disponíveis pra buscar o restante. Confira aqui os dados desta parcial: valor ${formatarMoeda(
                p.nota_valor_total
              )}${p.nota_numero ? `, Nº nota ${escapeHtml(p.nota_numero)}` : ""}.</div>`
            : divergente
              ? `<div class="conferencia-box warn">${renderDivergenciasParada(p)}<a class="btn secondary small" href="${linkAvisoComprador(
                  p
                )}" target="_blank" rel="noopener">📱 Avisar comprador</a></div>`
              : ""
        }
        <div class="card-meta">
          ${
            p.recebido_em
              ? `✅ Recebido por ${escapeHtml(p.recebido_por || "—")} em ${formatarDataHora(p.recebido_em)}` +
                (p.recebido_observacao
                  ? `<div class="card-meta">💬 ${escapeHtml(p.recebido_observacao)} <a class="arquivo-link" href="${linkAvisoObservacaoRecebimento(
                      p
                    )}" target="_blank" rel="noopener">📱 Enviar observação do almoxarifado pro comprador</a></div>`
                  : "") +
                (Array.isArray(p.recebido_fotos) && p.recebido_fotos.length
                  ? `<div class="card-meta">${p.recebido_fotos
                      .map((url, i) => `<a class="arquivo-link" href="${url}" target="_blank" rel="noopener">📷 foto ${i + 1}</a>`)
                      .join(" ")}</div>`
                  : "")
              : `<div class="recebimento-form">
                  <textarea class="input-obs-recebimento" data-parada-id="${p.id}" rows="2" placeholder="Observação (opcional)"></textarea>
                  <input type="file" class="input-fotos-recebimento" data-parada-id="${p.id}" accept="image/*" capture="environment" multiple>
                  <button class="btn secondary small" type="button" data-confirmar-recebimento="${p.id}">✅ Confirmar recebimento</button>
                </div>`
          }
        </div>
        <button class="link-btn danger" data-excluir-historico="${p.id}" type="button">Excluir</button>
      </div>`;
    })
    .join("");
}

async function loadHistorico() {
  const el = document.getElementById("lista-historico");
  const dataInicio = document.getElementById("filtro-data-inicio").value;
  const dataFim = document.getElementById("filtro-data-fim").value;
  let query = db
    .from("rl_rota_paradas")
    .select("*, rl_pedidos(*), rl_rotas(motorista_nome)")
    .eq("status", "concluida")
    .order("concluido_em", { ascending: false })
    .limit(50);
  // "Até" inclui o dia inteiro (23:59:59), não só a meia-noite.
  if (dataInicio) query = query.gte("concluido_em", `${dataInicio}T00:00:00`);
  if (dataFim) query = query.lte("concluido_em", `${dataFim}T23:59:59`);
  const { data, error } = await comTimeout(query);
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar histórico.</p>`;
    return;
  }
  historicoCache = data || [];

  const selEmpresa = document.getElementById("filtro-empresa-historico");
  const empresaAtual = selEmpresa.value;
  const empresas = [...new Set(historicoCache.map((p) => (p.rl_pedidos || {}).empresa_nome).filter(Boolean))].sort();
  selEmpresa.innerHTML =
    `<option value="">Todas as empresas</option>` + empresas.map((emp) => `<option value="${escapeHtml(emp)}">${escapeHtml(emp)}</option>`).join("");
  if (empresas.includes(empresaAtual)) selEmpresa.value = empresaAtual;

  renderHistorico();
}

document.getElementById("filtro-empresa-historico").addEventListener("change", renderHistorico);
document.getElementById("filtro-data-inicio").addEventListener("change", loadHistorico);
document.getElementById("filtro-data-fim").addEventListener("change", loadHistorico);
document.getElementById("btn-limpar-filtros-historico").addEventListener("click", () => {
  document.getElementById("filtro-empresa-historico").value = "";
  document.getElementById("filtro-data-inicio").value = "";
  document.getElementById("filtro-data-fim").value = "";
  loadHistorico();
});

document.getElementById("lista-historico").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-confirmar-recebimento]");
  if (!btn) return;
  const almoxarife = document.getElementById("almoxarife-select").value;
  if (!almoxarife) {
    mostrarAviso("Selecione seu nome (almoxarifado) primeiro.");
    return;
  }
  const paradaId = btn.dataset.confirmarRecebimento;
  const card = btn.closest(".historico-parada-card");
  const observacao = card.querySelector(".input-obs-recebimento")?.value.trim() || null;
  const inputFotos = card.querySelector(".input-fotos-recebimento");
  const arquivos = inputFotos ? Array.from(inputFotos.files) : [];

  btn.disabled = true;
  btn.textContent = arquivos.length ? "Enviando fotos..." : "Salvando...";
  try {
    const fotosUrls = [];
    for (const arquivo of arquivos) {
      const { url } = await uploadArquivo(arquivo, "rl_recebimentos");
      fotosUrls.push(url);
    }
    const { error } = await db
      .from("rl_rota_paradas")
      .update({
        recebido_por: almoxarife,
        recebido_em: new Date().toISOString(),
        recebido_observacao: observacao,
        recebido_fotos: fotosUrls.length ? fotosUrls : null,
      })
      .eq("id", paradaId);
    if (error) throw error;
    await loadHistorico();
  } catch (err) {
    mostrarAviso("Erro ao confirmar recebimento: " + err.message);
    btn.disabled = false;
    btn.textContent = "✅ Confirmar recebimento";
  }
});

// mesmo padrão de confirmação por duplo clique usado em "Meus pedidos"/"Pedidos disponíveis"
document.getElementById("lista-historico").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-excluir-historico]");
  if (!btn) return;
  if (!btn.dataset.confirmando) {
    btn.dataset.confirmando = "1";
    btn.textContent = "Clique de novo para confirmar";
    setTimeout(() => {
      delete btn.dataset.confirmando;
      btn.textContent = "Excluir";
    }, 4000);
    return;
  }
  const { error } = await db.from("rl_rota_paradas").delete().eq("id", btn.dataset.excluirHistorico);
  if (error) {
    mostrarAviso("Erro ao excluir: " + error.message);
    return;
  }
  loadHistorico();
});

// ---------- botões de atualizar (dados podem mudar por outro comprador/motorista usando o site ao mesmo tempo) ----------
document.getElementById("btn-atualizar-comprador").addEventListener("click", loadMeusPedidos);
document.getElementById("btn-atualizar-motorista").addEventListener("click", () => {
  loadDisponiveis();
  loadRotaAtual();
});
document.getElementById("btn-atualizar-indicadores").addEventListener("click", loadIndicadores);
document.getElementById("btn-atualizar-historico").addEventListener("click", loadHistorico);
document.getElementById("btn-atualizar-config").addEventListener("click", async () => {
  await Promise.all([loadEmpresas(), loadCompradores(), loadMotoristas()]);
  renderCadastros();
});

// ---------- inicialização ----------
(async function init() {
  await Promise.all([loadCompradores(), loadMotoristas(), loadEmpresas(), loadAlmoxarifes()]);
  loadMeusPedidos();
})();
