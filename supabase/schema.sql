-- Courses Arsenal : schéma Supabase
-- À exécuter une seule fois dans Supabase > SQL Editor > New query > coller > Run.
-- Chaque foyer ne voit que ses propres données (règles RLS).

-- ---------- Tables ----------
create table if not exists public.foyers (
  id    uuid primary key default gen_random_uuid(),
  nom   text not null default 'Notre foyer',
  code  text not null unique,              -- code d'invitation (6 caractères)
  cree  timestamptz not null default now()
);

create table if not exists public.membres (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  prenom   text not null,
  cree     timestamptz not null default now()
);

create table if not exists public.articles (
  foyer_id          uuid not null references public.foyers(id) on delete cascade,
  id                text not null,
  nom               text not null,
  rayon             text not null,
  position          integer not null default 0,
  unite             text not null default 'unité',
  quantite          numeric not null default 0,
  priorite          integer not null default 1,
  propose           boolean not null default true,
  commentaire       text not null default '',
  photo             text,                  -- petite image JPEG en data URL (240 px)
  emplacement_ordre integer,
  maj               timestamptz not null default now(),
  primary key (foyer_id, id)
);

create table if not exists public.listes (
  foyer_id uuid not null references public.foyers(id) on delete cascade,
  id       text not null,
  nom      text not null,
  cree     timestamptz not null default now(),
  statut   text not null default 'en_cours' check (statut in ('en_cours', 'terminee')),
  termine  timestamptz,
  maj      timestamptz not null default now(),
  primary key (foyer_id, id)
);

create table if not exists public.lignes (
  foyer_id    uuid not null,
  liste_id    text not null,
  id          text not null,
  article     text,                        -- null pour un article ponctuel
  nom         text not null,
  rayon       text not null,
  quantite    numeric not null default 1,
  unite       text not null default 'unité',
  commentaire text not null default '',
  coche       boolean not null default false,
  manquant    boolean not null default false,
  coche_par   text,
  ajoute_par  text,
  ajoute      timestamptz,
  maj         timestamptz not null default now(),
  primary key (foyer_id, liste_id, id),
  foreign key (foyer_id, liste_id) references public.listes(foyer_id, id) on delete cascade
);

-- Date de dernière modification
create or replace function public.touche_maj() returns trigger
language plpgsql as $$ begin new.maj = now(); return new; end $$;

drop trigger if exists maj_articles on public.articles;
create trigger maj_articles before update on public.articles for each row execute function public.touche_maj();
drop trigger if exists maj_listes on public.listes;
create trigger maj_listes before update on public.listes for each row execute function public.touche_maj();
drop trigger if exists maj_lignes on public.lignes;
create trigger maj_lignes before update on public.lignes for each row execute function public.touche_maj();

-- ---------- Sécurité : chacun ne voit que son foyer ----------
create or replace function public.mon_foyer() returns uuid
language sql stable security definer set search_path = public as $$
  select foyer_id from public.membres where user_id = auth.uid()
$$;

alter table public.foyers   enable row level security;
alter table public.membres  enable row level security;
alter table public.articles enable row level security;
alter table public.listes   enable row level security;
alter table public.lignes   enable row level security;

drop policy if exists foyer_lecture on public.foyers;
create policy foyer_lecture on public.foyers for select using (id = public.mon_foyer());

drop policy if exists membres_lecture on public.membres;
create policy membres_lecture on public.membres for select using (foyer_id = public.mon_foyer());

drop policy if exists articles_foyer on public.articles;
create policy articles_foyer on public.articles for all
  using (foyer_id = public.mon_foyer()) with check (foyer_id = public.mon_foyer());

drop policy if exists listes_foyer on public.listes;
create policy listes_foyer on public.listes for all
  using (foyer_id = public.mon_foyer()) with check (foyer_id = public.mon_foyer());

drop policy if exists lignes_foyer on public.lignes;
create policy lignes_foyer on public.lignes for all
  using (foyer_id = public.mon_foyer()) with check (foyer_id = public.mon_foyer());

-- ---------- Fonctions appelées par l'application ----------
create or replace function public.mon_profil() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('user_id', m.user_id, 'foyer_id', m.foyer_id, 'prenom', m.prenom,
                           'foyer_nom', f.nom, 'code', f.code)
  from public.membres m join public.foyers f on f.id = m.foyer_id
  where m.user_id = auth.uid()
$$;

create or replace function public.creer_foyer(p_prenom text, p_nom text default 'Notre foyer') returns json
language plpgsql security definer set search_path = public as $$
declare f uuid; c text;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(trim(p_prenom), '') = '' then raise exception 'Prénom requis'; end if;
  if exists (select 1 from public.membres where user_id = auth.uid()) then
    raise exception 'Vous faites déjà partie d''un foyer';
  end if;
  loop
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.foyers where code = c);
  end loop;
  insert into public.foyers (nom, code) values (coalesce(nullif(trim(p_nom), ''), 'Notre foyer'), c) returning id into f;
  insert into public.membres (user_id, foyer_id, prenom) values (auth.uid(), f, trim(p_prenom));
  return public.mon_profil();
end $$;

create or replace function public.rejoindre_foyer(p_code text, p_prenom text) returns json
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  if coalesce(trim(p_prenom), '') = '' then raise exception 'Prénom requis'; end if;
  select id into f from public.foyers where code = upper(trim(p_code));
  if f is null then raise exception 'Code inconnu'; end if;
  insert into public.membres (user_id, foyer_id, prenom) values (auth.uid(), f, trim(p_prenom))
    on conflict (user_id) do update set foyer_id = excluded.foyer_id, prenom = excluded.prenom;
  return public.mon_profil();
end $$;

create or replace function public.changer_prenom(p_prenom text) returns json
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_prenom), '') = '' then raise exception 'Prénom requis'; end if;
  update public.membres set prenom = trim(p_prenom) where user_id = auth.uid();
  return public.mon_profil();
end $$;

create or replace function public.membres_du_foyer() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('prenom', prenom, 'moi', user_id = auth.uid()) order by cree), '[]'::json)
  from public.membres where foyer_id = public.mon_foyer()
$$;

revoke execute on function public.creer_foyer(text, text), public.rejoindre_foyer(text, text),
  public.changer_prenom(text), public.mon_profil(), public.membres_du_foyer() from anon, public;
grant execute on function public.creer_foyer(text, text), public.rejoindre_foyer(text, text),
  public.changer_prenom(text), public.mon_profil(), public.membres_du_foyer() to authenticated;

-- ---------- Temps réel ----------
do $$ begin
  begin alter publication supabase_realtime add table public.articles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.listes;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.lignes;   exception when duplicate_object then null; end;
end $$;
