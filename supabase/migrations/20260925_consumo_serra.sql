-- Consumo da Serra (2026-09-25): a estação da Serra bipa o QR Code (LS<yy>-<n>) de uma lâmina seca produzida na
-- Secagem; a lâmina ganha saida = true e o consumo fica registrado. Sem setup, sem PIN (estação logada).
--
-- Só lâminas de secagem_apontamentos podem ser consumidas. O contador LS é compartilhado com serra_apontamentos,
-- então um QR nunca existe nas duas tabelas; se o QR bipado for de uma produção da Serra, a função avisa.

create table public.serra_consumos (
  id uuid primary key default gen_random_uuid(),
  data_consumo timestamp with time zone not null default now(),
  bpl_id integer,
  qrcode text not null,
  apontamento_id uuid not null unique references public.secagem_apontamentos (id),
  -- Snapshot da lâmina no momento do consumo (a lista do portal não precisa de join)
  cod_item text,
  item text,
  especie text,
  bitola numeric,
  comprimento numeric,
  largura numeric,
  altura_pecas numeric,
  total numeric,
  tablet_user_id uuid references auth.users (id),
  consumido_por_nome text
);

create index serra_consumos_data_idx on public.serra_consumos (data_consumo desc);

alter table public.serra_consumos enable row level security;

create policy "Usuários autenticados podem ver consumos da serra"
  on public.serra_consumos for select
  to authenticated
  using (true);

-- Estorno (excluir o consumo no portal) só para admin ou quem tem "Ações" no PCP. Inserção: só pela função.
create policy "PCP pode estornar consumos da serra"
  on public.serra_consumos for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = auth.uid()
         and m.slug = 'pcp'
         and ump.can_actions
    )
  );

-- Excluir o consumo devolve a lâmina ao estoque (saida = false).
create or replace function public.serra_consumo_estorno()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.secagem_apontamentos set saida = false where id = old.apontamento_id;
  return old;
end;
$function$;

revoke execute on function public.serra_consumo_estorno() from public, anon, authenticated;

create trigger serra_consumo_estorno_trg
  after delete on public.serra_consumos
  for each row execute function public.serra_consumo_estorno();

-- Dá baixa numa lâmina seca pelo QR Code. Devolve um jsonb com "status":
--   OK             consumida agora (traz os dados da lâmina)
--   NAO_ENCONTRADA QR inexistente
--   ETIQUETA_SERRA QR é de uma produção da Serra, não de Secagem
--   JA_CONSUMIDA   já estava com saída (traz quando/quem, se foi pelo Consumo da Serra)
--   QRCODE_VAZIO
-- A linha da lâmina é travada (for update) para dois tablets bipando a mesma etiqueta não consumirem duas vezes.
create or replace function public.consumir_lamina_seca(p_qrcode text, p_bpl_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_qr text := upper(trim(coalesce(p_qrcode, '')));
  v_ap public.secagem_apontamentos;
  v_cons public.serra_consumos;
  v_nome text;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;

  if not (
    public.is_admin()
    or exists (
      select 1
        from public.user_module_permissions ump
        join public.modules m on m.id = ump.module_id
       where ump.user_id = v_uid
         and m.slug in ('app_consumo_serra', 'pcp')
         and ump.can_actions
    )
  ) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  if v_qr = '' then
    return jsonb_build_object('status', 'QRCODE_VAZIO');
  end if;

  select * into v_ap from public.secagem_apontamentos where upper(qrcode) = v_qr for update;

  if not found then
    if exists (select 1 from public.serra_apontamentos where upper(qrcode) = v_qr) then
      return jsonb_build_object('status', 'ETIQUETA_SERRA', 'qrcode', v_qr);
    end if;
    return jsonb_build_object('status', 'NAO_ENCONTRADA', 'qrcode', v_qr);
  end if;

  if v_ap.saida then
    select * into v_cons from public.serra_consumos where apontamento_id = v_ap.id;
    return jsonb_build_object(
      'status', 'JA_CONSUMIDA',
      'qrcode', v_ap.qrcode,
      'cod_item', v_ap.cod_item,
      'item', v_ap.item,
      'data_consumo', v_cons.data_consumo,
      'consumido_por', v_cons.consumido_por_nome
    );
  end if;

  select up.full_name into v_nome from public.user_profiles up where up.id = v_uid;

  update public.secagem_apontamentos set saida = true where id = v_ap.id;

  insert into public.serra_consumos (
    bpl_id, qrcode, apontamento_id, cod_item, item, especie, bitola, comprimento, largura,
    altura_pecas, total, tablet_user_id, consumido_por_nome
  ) values (
    p_bpl_id, v_ap.qrcode, v_ap.id, v_ap.cod_item, v_ap.item, v_ap.especie, v_ap.bitola, v_ap.comprimento, v_ap.largura,
    v_ap.altura_pecas, v_ap.total, v_uid, v_nome
  );

  return jsonb_build_object(
    'status', 'OK',
    'qrcode', v_ap.qrcode,
    'cod_item', v_ap.cod_item,
    'item', v_ap.item,
    'especie', v_ap.especie,
    'bitola', v_ap.bitola,
    'comprimento', v_ap.comprimento,
    'largura', v_ap.largura,
    'altura_pecas', v_ap.altura_pecas,
    'total', v_ap.total
  );
end;
$function$;

revoke execute on function public.consumir_lamina_seca(text, integer) from public, anon;
grant execute on function public.consumir_lamina_seca(text, integer) to authenticated;

-- Módulo de permissão do app (grupo Serra).
insert into public.modules (name, slug, description, icon, is_active, sort_order, type, group_name) values
  ('Consumo Serra', 'app_consumo_serra', 'Consumo de lâminas secas na Serra (bipar QR Code)', 'factory', true, 40, 'app', 'Serra');
