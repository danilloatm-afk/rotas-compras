-- Rotas de Compras — schema Supabase (prefixo rl_)
-- Mesmo projeto Supabase compartilhado com os outros apps
-- (Contas Mensais, Bebedouros, Painel de Operações, Controle de Qualidade,
-- Avanço para Contratos). Rode este script no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

-- Cadastro das empresas do grupo (cada uma com seu CNPJ), usado pra
-- conferir se a nota fiscal recebida foi emitida pra empresa certa.
create table rl_empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table rl_compradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table rl_motoristas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table rl_pedidos (
  id uuid primary key default gen_random_uuid(),
  comprador_nome text not null,
  empresa_id uuid references rl_empresas(id),
  empresa_nome text,
  empresa_cnpj text,
  fornecedor_nome text,
  numero_pedido text,
  local_retirada text,
  arquivo_url text not null,
  arquivo_nome text,
  observacao text,
  urgente boolean not null default false,
  parcial_esperado boolean not null default false,
  retirar_transportadora boolean not null default false,
  condicao_pagamento_codigo text,
  valor_total numeric,
  itens jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'na_rota', 'concluido', 'cancelado')),
  criado_em timestamptz not null default now()
);

create table rl_rotas (
  id uuid primary key default gen_random_uuid(),
  motorista_nome text not null,
  data date not null default current_date,
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'cancelada')),
  criado_em timestamptz not null default now()
);

create table rl_rota_paradas (
  id uuid primary key default gen_random_uuid(),
  rota_id uuid not null references rl_rotas(id) on delete cascade,
  pedido_id uuid not null references rl_pedidos(id),
  ordem int not null default 0,
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  nota_arquivo_url text,
  nota_numero text,
  nota_valor_total numeric,
  nota_cnpj text,
  nota_itens jsonb,
  nota_tipo_documento text,
  nota_emitente_nome text,
  nota_data_emissao date,
  nota_parcelas jsonb,
  entrega_parcial boolean not null default false,
  divergencia_valor boolean not null default false,
  divergencia_cnpj boolean not null default false,
  divergencia_itens boolean not null default false,
  divergencia_condicao_pagamento boolean not null default false,
  recebido_por text,
  recebido_em timestamptz,
  recebido_observacao text,
  recebido_fotos jsonb,
  concluido_em timestamptz,
  criado_em timestamptz not null default now()
);

-- Almoxarifado: confere e confirma o recebimento de cada parada concluída
-- (nome + data/hora), visível na aba Histórico.
create table rl_almoxarifes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index on rl_pedidos (status);
create index on rl_pedidos (numero_pedido);
create index on rl_rota_paradas (rota_id);
create index on rl_rota_paradas (pedido_id);

alter table rl_empresas enable row level security;
alter table rl_compradores enable row level security;
alter table rl_motoristas enable row level security;
alter table rl_pedidos enable row level security;
alter table rl_rotas enable row level security;
alter table rl_rota_paradas enable row level security;
alter table rl_almoxarifes enable row level security;

create policy "allow all" on rl_empresas for all using (true) with check (true);
create policy "allow all" on rl_compradores for all using (true) with check (true);
create policy "allow all" on rl_motoristas for all using (true) with check (true);
create policy "allow all" on rl_pedidos for all using (true) with check (true);
create policy "allow all" on rl_rotas for all using (true) with check (true);
create policy "allow all" on rl_rota_paradas for all using (true) with check (true);
create policy "allow all" on rl_almoxarifes for all using (true) with check (true);

-- Pré-cadastro das empresas do grupo (CNPJs confirmados em pedidos reais),
-- usadas na conferência com a nota fiscal.
insert into rl_empresas (nome, cnpj) values
  ('AGRICOLA WEHRMANN LTDA', '35.563.152/0001-87'),
  ('DOIS MARCOS SEMENTES LTDA', '00.291.633/0001-04');

-- Depois de rodar este script, crie manualmente (Storage → New bucket,
-- marcar "Public bucket") os buckets:
--   rl_pedidos      (anexos dos pedidos de compra)
--   rl_notas        (fotos das notas fiscais)
--   rl_recebimentos (fotos tiradas pelo almoxarifado na conferência)
-- O insert direto em storage.buckets via SQL Editor costuma não funcionar
-- de forma confiável (mesma observação já feita nos outros apps).
--
-- IMPORTANTE: marcar o bucket como "Public" só libera LEITURA pública dos
-- arquivos — não libera upload. Sem as policies abaixo, qualquer tentativa
-- de anexar um pedido ou nota fiscal falha com "new row violates row-level
-- security policy" (erro 403). Rode isto DEPOIS de criar os três buckets:

create policy "rl_pedidos read" on storage.objects for select using (bucket_id = 'rl_pedidos');
create policy "rl_pedidos insert" on storage.objects for insert with check (bucket_id = 'rl_pedidos');

create policy "rl_notas read" on storage.objects for select using (bucket_id = 'rl_notas');
create policy "rl_notas insert" on storage.objects for insert with check (bucket_id = 'rl_notas');

create policy "rl_recebimentos read" on storage.objects for select using (bucket_id = 'rl_recebimentos');
create policy "rl_recebimentos insert" on storage.objects for insert with check (bucket_id = 'rl_recebimentos');
