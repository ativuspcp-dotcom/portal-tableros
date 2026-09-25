-- Módulo do portal "Qualidade" (Registros > setor > RQ). Só cria o módulo de permissão;
-- as telas de cada RQ ainda são placeholders (src/pages/qualidade.js).
-- Não confundir com os módulos do app-operacional do grupo "Qualidade" (slugs app_qualidade_*).
insert into public.modules (name, slug, description, icon, is_active, sort_order, type)
values ('Qualidade', 'qualidade', 'Registros de qualidade por setor', 'qualidade', true, 6, 'portal')
on conflict (slug) do nothing;
