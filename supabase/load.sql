-- Нагрузка (раздел «Нагрузка»). Выполни один раз в SQL Editor, если основная схема уже создана.
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
