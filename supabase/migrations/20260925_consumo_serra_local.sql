-- Consumo da Serra: a estação escolhe SERRA 1 ou SERRA 2 (local do consumo) antes de bipar o QR Code.
-- serra_consumos.serra guarda o nome; consumir_lamina_seca passa a receber p_serra e valida que ela existe e
-- está ativa na filial (senão devolve SERRA_INVALIDA). A versão sem p_serra é apagada.
alter table public.serra_consumos add column serra text;

drop function public.consumir_lamina_seca(text, integer);

create or replace function public.consumir_lamina_seca(p_qrcode text, p_serra text, p_bpl_id integer)
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

  if not exists (
    select 1 from public.pcp_serras s
     where s.bpl_id = p_bpl_id and s.nome = p_serra and s.ativo
  ) then
    return jsonb_build_object('status', 'SERRA_INVALIDA');
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
      'consumido_por', v_cons.consumido_por_nome,
      'serra', v_cons.serra
    );
  end if;

  select up.full_name into v_nome from public.user_profiles up where up.id = v_uid;

  update public.secagem_apontamentos set saida = true where id = v_ap.id;

  insert into public.serra_consumos (
    bpl_id, serra, qrcode, apontamento_id, cod_item, item, especie, bitola, comprimento, largura,
    altura_pecas, total, tablet_user_id, consumido_por_nome
  ) values (
    p_bpl_id, p_serra, v_ap.qrcode, v_ap.id, v_ap.cod_item, v_ap.item, v_ap.especie, v_ap.bitola, v_ap.comprimento, v_ap.largura,
    v_ap.altura_pecas, v_ap.total, v_uid, v_nome
  );

  return jsonb_build_object(
    'status', 'OK',
    'serra', p_serra,
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

revoke execute on function public.consumir_lamina_seca(text, text, integer) from public, anon;
grant execute on function public.consumir_lamina_seca(text, text, integer) to authenticated;
