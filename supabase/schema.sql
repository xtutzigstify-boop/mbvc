-- Таблицы с префиксом sched_, чтобы не пересекаться с другими проектами в этой базе.
-- Справочники: имя — первичный ключ, поэтому пары ссылаются на них напрямую
create table sched_groups   (name text primary key);
create table sched_teachers (name text primary key);
create table sched_subjects (name text primary key);
create table sched_rooms    (name text primary key);

create table sched_lessons (
  id      uuid primary key default gen_random_uuid(),
  grp     text     not null references sched_groups(name)   on update cascade on delete cascade,
  day     smallint not null check (day between 0 and 4),   -- 0 = понедельник
  pair    smallint not null check (pair between 1 and 8),
  week    smallint not null default 0 check (week between 0 and 2),   -- 0 = каждая неделя, 1/2 = чередование
  subject text     not null references sched_subjects(name) on update cascade,
  teacher text              references sched_teachers(name) on update cascade,
  room    text              references sched_rooms(name)    on update cascade,
  unique (grp, day, pair, week)
);

-- Читать может любой, менять — только вошедшие через Google.
-- Перед деплоем ограничь запись своей почтой: using (auth.jwt()->>'email' = 'you@gmail.com')
do $$ declare t text; begin
  foreach t in array array['sched_groups','sched_teachers','sched_subjects','sched_rooms','sched_lessons'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "read %1$s" on %1$I for select using (true)', t);
    execute format('create policy "write %1$s" on %1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Нагрузка
create table if not exists sched_load (
  id      uuid primary key default gen_random_uuid(),
  grp     text not null,
  subject text not null,
  teacher text,
  sem1    numeric not null default 0,   -- часы в 1 семестре
  sem2    numeric not null default 0,   -- часы во 2 семестре
  total   numeric not null default 0    -- всего часов
);

alter table sched_load enable row level security;
create policy "read sched_load"  on sched_load for select using (true);
create policy "write sched_load" on sched_load for all to authenticated using (true) with check (true);
