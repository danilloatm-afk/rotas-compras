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
    if (btn.dataset.tab === "config") renderCadastros();
  });
});

// ---------- caches ----------
let compradoresCache = [];
let motoristasCache = [];
let empresasCache = [];

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

document.getElementById("btn-novo-comprador").addEventListener("click", async () => {
  const nome = (prompt("Nome do comprador:") || "").trim();
  if (!nome) return;
  const existente = compradoresCache.find((c) => c.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_compradores").insert({ nome });
    if (error) return alert("Erro ao cadastrar: " + error.message);
  }
  await loadCompradores();
  document.getElementById("comprador-select").value = nome;
  localStorage.setItem("rl_comprador_atual", nome);
  loadMeusPedidos();
});

document.getElementById("btn-novo-motorista").addEventListener("click", async () => {
  const nome = (prompt("Nome do motorista:") || "").trim();
  if (!nome) return;
  const existente = motoristasCache.find((m) => m.nome.toLowerCase() === nome.toLowerCase());
  if (!existente) {
    const { error } = await db.from("rl_motoristas").insert({ nome });
    if (error) return alert("Erro ao cadastrar: " + error.message);
  }
  await loadMotoristas();
  document.getElementById("motorista-select").value = nome;
  localStorage.setItem("rl_motorista_atual", nome);
  rotaAtualId = null;
  loadRotaAtual();
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
      urgente: document.getElementById("pedido-urgente").checked,
      valor_total: valor ? Number(valor) : null,
    });
    if (error) throw error;

    feedback.textContent = "Pedido enviado com sucesso!";
    feedback.className = "feedback success";
    document.getElementById("form-pedido").reset();
    document.getElementById("pedido-empresa-info").textContent = "";
    document.getElementById("pedido-ia-feedback").textContent = "";
    document.getElementById("pedido-duplicado-aviso").classList.add("hidden");
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
      ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
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

document.getElementById("lista-meus-pedidos").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-cancelar]");
  if (!btn) return;
  if (!confirm("Cancelar este pedido?")) return;
  await db.from("rl_pedidos").update({ status: "cancelado" }).eq("id", btn.dataset.cancelar);
  loadMeusPedidos();
});

// ---------- motorista: pedidos disponíveis ----------
async function loadDisponiveis() {
  const el = document.getElementById("lista-disponiveis");
  const { data, error } = await comTimeout(
    db.from("rl_pedidos").select("*").eq("status", "pendente").order("urgente", { ascending: false }).order("criado_em")
  );
  if (error) {
    el.innerHTML = `<p class="empty-state">Erro ao carregar pedidos.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state">Nenhum pedido pendente no momento.</p>`;
    return;
  }
  el.innerHTML = data
    .map(
      (p) => `
    <div class="card-pedido">
      <div class="card-pedido-head">
        <strong>${escapeHtml(p.empresa_nome || "Empresa não informada")}</strong>
        ${p.urgente ? `<span class="badge urgente">Urgente</span>` : ""}
      </div>
      <div class="card-meta">Comprador: ${escapeHtml(p.comprador_nome)} · ${formatarDataHora(p.criado_em)}${p.numero_pedido ? ` · Nº ${escapeHtml(p.numero_pedido)}` : ""}</div>
      ${p.local_retirada ? `<div class="card-meta">📍 ${escapeHtml(p.local_retirada)}</div>` : ""}
      <div class="card-linha"><span>Valor esperado</span><strong>${formatarMoeda(p.valor_total)}</strong></div>
      ${p.observacao ? `<div class="card-meta">${escapeHtml(p.observacao)}</div>` : ""}
      <a class="arquivo-link" href="${p.arquivo_url}" target="_blank" rel="noopener">📎 ${escapeHtml(p.arquivo_nome || "arquivo")}</a>
      <label class="selecionar"><input type="checkbox" class="pedido-check" data-id="${p.id}"> Incluir na rota</label>
    </div>`
    )
    .join("");
}

document.getElementById("btn-montar-rota").addEventListener("click", async () => {
  const motoristaNome = document.getElementById("motorista-select").value;
  if (!motoristaNome) return alert("Selecione seu nome (motorista) primeiro.");
  const ids = Array.from(document.querySelectorAll(".pedido-check:checked")).map((c) => c.dataset.id);
  if (!ids.length) return alert("Selecione ao menos um pedido.");

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
    alert("Erro ao montar rota: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- motorista: rota do dia ----------
let rotaAtualId = null;
let paradasCache = [];
let dragIndex = null;
let paradaEmEdicao = null;

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
  if (!rotas || !rotas.length) {
    rotaAtualId = null;
    paradasCache = [];
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma rota em andamento. Selecione pedidos acima e clique em "Montar rota".</li>`;
    return;
  }
  rotaAtualId = rotas[0].id;
  const { data: paradas, error } = await comTimeout(
    db.from("rl_rota_paradas").select("*, rl_pedidos(*)").eq("rota_id", rotaAtualId).order("ordem")
  );
  if (error) {
    lista.innerHTML = `<li class="empty-state">Erro ao carregar rota.</li>`;
    return;
  }
  paradasCache = paradas || [];
  renderRota();
}

function renderRota() {
  const progresso = document.getElementById("rota-progresso");
  const lista = document.getElementById("lista-rota");
  if (!paradasCache.length) {
    progresso.textContent = "";
    lista.innerHTML = `<li class="empty-state">Nenhuma parada na rota ainda.</li>`;
    return;
  }
  const concluidas = paradasCache.filter((p) => p.status === "concluida").length;
  progresso.textContent = `${concluidas} de ${paradasCache.length} paradas concluídas.`;

  lista.innerHTML = paradasCache
    .map((p, i) => {
      const pedido = p.rl_pedidos || {};
      const divergencia = p.divergencia_valor || p.divergencia_cnpj;
      return `
      <li class="rota-item ${p.status === "concluida" ? "concluida" : ""}" draggable="true" data-index="${i}">
        <span class="drag-handle">⠿</span>
        <span class="ordem-num">${i + 1}</span>
        <div class="rota-item-info">
          <strong>${escapeHtml(pedido.empresa_nome || "Empresa não informada")}</strong>
          <span>Comprador: ${escapeHtml(pedido.comprador_nome || "—")} · Valor esperado: ${formatarMoeda(pedido.valor_total)}</span>
          ${pedido.local_retirada ? `<span>📍 ${escapeHtml(pedido.local_retirada)}</span>` : ""}
          ${pedido.arquivo_url ? `<a class="arquivo-link" href="${pedido.arquivo_url}" target="_blank" rel="noopener">📎 pedido</a>` : ""}
          ${divergencia ? `<span class="divergencia-tag">⚠️ Divergência na conferência da nota</span>` : ""}
        </div>
        ${
          p.status === "concluida"
            ? `<span class="badge status-concluido">Concluída</span>`
            : `<button class="btn secondary small" type="button" data-concluir="${p.id}">Concluir</button>`
        }
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
document.getElementById("lista-rota").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-concluir]");
  if (!btn) return;
  paradaEmEdicao = paradasCache.find((p) => String(p.id) === btn.dataset.concluir);
  if (!paradaEmEdicao) return;
  document.getElementById("form-modal-nota").reset();
  document.getElementById("nota-ia-feedback").textContent = "";
  document.getElementById("modal-feedback").textContent = "";
  document.getElementById("conferencia-resultado").classList.add("hidden");
  document.getElementById("modal-overlay").classList.remove("hidden");
});

document.getElementById("btn-modal-fechar").addEventListener("click", () => {
  document.getElementById("modal-overlay").classList.add("hidden");
  paradaEmEdicao = null;
});

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
    feedback.textContent = "Nota lida. Confira os valores abaixo.";
    feedback.className = "feedback success";
    atualizarConferencia();
  } catch (err) {
    feedback.textContent = "Erro: " + err.message;
    feedback.className = "feedback error";
  }
});

document.getElementById("nota-valor").addEventListener("input", atualizarConferencia);
document.getElementById("nota-cnpj").addEventListener("input", atualizarConferencia);

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

function atualizarConferencia() {
  if (!paradaEmEdicao) return;
  const { msgValor, divergValor, msgCnpj, divergCnpj } = calcularDivergencias();
  const box = document.getElementById("conferencia-resultado");
  box.classList.remove("hidden", "ok", "warn");
  box.classList.add(divergValor || divergCnpj ? "warn" : "ok");
  box.innerHTML = `<div>${msgValor}</div><div>${msgCnpj}</div>`;
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
    const { divergValor, divergCnpj } = calcularDivergencias();
    const notaValor = document.getElementById("nota-valor").value;
    const notaCnpj = document.getElementById("nota-cnpj").value.trim();
    const notaNumero = document.getElementById("nota-numero").value.trim();

    const { error: errParada } = await db
      .from("rl_rota_paradas")
      .update({
        status: "concluida",
        nota_arquivo_url: url,
        nota_numero: notaNumero || null,
        nota_valor_total: notaValor ? Number(notaValor) : null,
        nota_cnpj: notaCnpj || null,
        divergencia_valor: divergValor,
        divergencia_cnpj: divergCnpj,
        concluido_em: new Date().toISOString(),
      })
      .eq("id", paradaEmEdicao.id);
    if (errParada) throw errParada;

    const { error: errPedido } = await db.from("rl_pedidos").update({ status: "concluido" }).eq("id", paradaEmEdicao.pedido_id);
    if (errPedido) throw errPedido;

    const { data: pendentes } = await db.from("rl_rota_paradas").select("id").eq("rota_id", rotaAtualId).eq("status", "pendente");
    if (!pendentes || !pendentes.length) {
      await db.from("rl_rotas").update({ status: "concluida" }).eq("id", rotaAtualId);
    }

    document.getElementById("modal-overlay").classList.add("hidden");
    paradaEmEdicao = null;
    await loadRotaAtual();
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
  if (error) return alert("Erro ao cadastrar: " + error.message);
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
}

document.getElementById("tab-config").addEventListener("click", async (e) => {
  const btnEmp = e.target.closest("button[data-toggle-empresa]");
  const btnComp = e.target.closest("button[data-toggle-comprador]");
  const btnMot = e.target.closest("button[data-toggle-motorista]");
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
  renderCadastros();
});

// ---------- inicialização ----------
(async function init() {
  await Promise.all([loadCompradores(), loadMotoristas(), loadEmpresas()]);
  loadMeusPedidos();
})();
