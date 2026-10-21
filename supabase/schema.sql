-- Справочники: имя — первичный ключ, поэтому уроки ссылаются на них напрямую
create table groups   (name text primary key);
create table teachers (name text primary key);
create table subjects (name text primary key);
create table rooms    (name text primary key);

create table lessons (
  id      uuid primary key default gen_random_uuid(),
  grp     text     not null references groups(name)   on update cascade on delete cascade,
  day     smallint not null check (day between 0 and 4),   -- 0 = понедельник
  pair    smallint not null check (pair between 1 and 8),
  week    smallint not null default 0 check (week between 0 and 2),   -- 0 = каждую неделю, 1/2 = чередование
  subject text     not null references subjects(name) on update cascade,
  teacher text              references teachers(name) on update cascade,
  room    text              references rooms(name)    on update cascade,
  unique (grp, day, pair, week)
);

-- Читать может любой, менять — только вошедшие через Google.
-- Перед деплоем ограничь запись своей почтой: using (auth.jwt()->>'email' = 'you@gmail.com')
do $$ declare t text; begin
  foreach t in array array['groups','teachers','subjects','rooms','lessons'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read %1$s" on %1$I for select using (true)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
