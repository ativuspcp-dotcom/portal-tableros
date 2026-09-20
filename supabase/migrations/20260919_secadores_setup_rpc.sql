-- Setup dos secadores (FEZER / OMECO): troca de setup com validação de PIN do apontador,
-- feita 100% no servidor e de forma atômica (nunca fica sem setup ativo, nunca tem dois ativos).
-- Usada pelo portal-tableros (PCP > OP > Secagem) e pelo app-operacional (módulo Setup Secadores).

alter table public.pcp_op_secagem
  add column if not exists responsavel_id uuid references public.app_apontadores(id) on delete set null,
  add column if not exists responsavel_nome text;

-- Código da OP nunca é reutilizado (OPs vazias são excluídas ao trocar o setup) nem colide entre filiais.
create sequence if not exists public.pcp_op_secagem_codigo_seq;

create or replace function public.salvar_setup_secador(
  p_secador text,
  p_pin text,
  p_tipo text,
  p_especie text,
  p_largura numeric,
  p_comprimento numeric,
  p_bitola numeric,
  p_turno text,
  p_bpl_id integer
)
returns setof public.pcp_op_secagem
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_uid uuid := auth.uid();
  v_filiais jsonb;
  v_ok boolean;
  v_resp record;
  v_atual public.pcp_op_secagem;
  v_tinha_atual boolean;
  v_novo public.pcp_op_secagem;
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
         and ((m.slug = 'app_setup_secadores' and ump.can_view)
           or (m.slug = 'pcp' and (ump.can_edit or ump.can_create)))
    )
  ) then
    raise exception 'SEM_PERMISSAO' using errcode = '42501';
  end if;

  select coalesce(nullif(up.filiais_permitidas, '[]'::jsonb), '[1]'::jsonb)
    into v_filiais
    from public.user_profiles up
   where up.id = v_uid;

  if v_filiais is null or p_bpl_id is null or not (v_filiais @> to_jsonb(p_bpl_id)) then
    raise exception 'FILIAL_NAO_PERMITIDA' using errcode = '42501';
  end if;

  v_ok := p_secador in ('FEZER', 'OMECO')
    and p_tipo in ('PRODUÇÃO', 'RESSEQUE')
    and p_especie in ('PINUS', 'EUCALIPTO')
    and p_turno in ('00:00 - 06:00', '06:00 - 12:00', '12:00 - 18:00', '18:00 - 00:00')
    and p_bitola in (1.5, 1.8, 2.0, 2.2, 2.5, 2.7, 3.1, 3.3)
    and (
      (p_secador = 'FEZER' and p_largura = 2.6 and p_comprimento in (1.3, 0.87))
      or (p_secador = 'OMECO' and (
            (p_largura = 2.6 and p_comprimento in (1.3, 0.87))
         or (p_largura = 1.3 and p_comprimento = 0.87)))
    );

  if v_ok is not true then
    raise exception 'SETUP_INVALIDO' using errcode = '22023';
  end if;

  select r.id, r.nome_completo into v_resp from public.validar_pin(p_pin) r;
  if not found then
    -- PIN inválido: devolve vazio em vez de lançar erro, senão o rollback desfaria o registro
    -- da tentativa errada feito por validar_pin (que alimenta o bloqueio por excesso de tentativas).
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('setup_secador:' || p_secador || ':' || p_bpl_id));

  select * into v_atual
    from public.pcp_op_secagem
   where secador = p_secador and bpl_id = p_bpl_id and status = 'Ativa';
  v_tinha_atual := found;

  if v_tinha_atual
     and v_atual.tipo = p_tipo and v_atual.especie = p_especie
     and v_atual.largura = p_largura and v_atual.comprimento = p_comprimento
     and v_atual.bitola = p_bitola and v_atual.turno = p_turno then
    return next v_atual;
    return;
  end if;

  if v_tinha_atual then
    -- Ainda não existem apontamentos de secagem: toda OP ativa está zerada e é excluída.
    -- Quando a tabela de apontamentos existir, OPs com produção devem ser encerradas
    -- (status = 'Encerrada', encerrada_at = now()) em vez de excluídas.
    delete from public.pcp_op_secagem where id = v_atual.id;
  end if;

  insert into public.pcp_op_secagem (
    bpl_id, secador, codigo_op, tipo, especie, largura, comprimento, bitola, turno,
    status, created_by, responsavel_id, responsavel_nome
  ) values (
    p_bpl_id, p_secador,
    'SEC-' || p_secador || '-' || lpad(nextval('public.pcp_op_secagem_codigo_seq')::text, 4, '0'),
    p_tipo, p_especie, p_largura, p_comprimento, p_bitola, p_turno,
    'Ativa', v_uid, v_resp.id, v_resp.nome_completo
  )
  returning * into v_novo;

  return next v_novo;
end;
$function$;

revoke all on function public.salvar_setup_secador(text, text, text, text, numeric, numeric, numeric, text, integer) from public, anon;
grant execute on function public.salvar_setup_secador(text, text, text, text, numeric, numeric, numeric, text, integer) to authenticated;

-- Escrita só pela função acima (garante PIN + regra de "sempre um setup ativo"); leitura continua liberada.
drop policy if exists "Usuários autenticados podem inserir ops de secagem" on public.pcp_op_secagem;
drop policy if exists "Usuários autenticados podem atualizar ops de secagem" on public.pcp_op_secagem;
drop policy if exists "Usuários autenticados podem deletar ops de secagem" on public.pcp_op_secagem;

insert into public.modules (name, slug, description, icon, is_active, sort_order, type, group_name)
values ('Setup Secadores', 'app_setup_secadores', 'Setup dos secadores FEZER e OMECO', 'factory', true, 25, 'app', 'Secagem')
on conflict (slug) do nothing;
