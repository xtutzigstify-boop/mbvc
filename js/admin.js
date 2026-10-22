/* admin.js — простая локальная админка.
   Без администратора сайт открыт только для просмотра. PIN хранится в этом браузере (как хеш), сервер не нужен.
   Это защита от случайных правок, а не от взлома: настоящая защита записи — вход Google + правила Supabase. */

const Admin = (() => {
  const PIN_KEY = 'po33-admin-pin', SESSION_KEY = 'po33-admin-on';
  const $ = sel => document.querySelector(sel);

  async function hash(text) {
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('po33:' + text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'x' + [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);   // запасной вариант без crypto
  }

  function apply(on) {
    document.body.dataset.admin = on ? '1' : '0';
    sessionStorage.setItem(SESSION_KEY, on ? '1' : '');
    $('#adminBtn').innerHTML = `<svg class="i"><use href="#i-${on ? 'unlock' : 'lock'}"/></svg>`;
    $('#adminBtn').title = on ? 'Выйти из режима администратора' : 'Войти как администратор';
    if (!on && window.Load) Load.setSection('schedule');
    App.render();
  }

  function ask() {
    const creating = !localStorage.getItem(PIN_KEY);
    $('#atitle').textContent = creating ? 'Создайте PIN администратора' : 'Вход для администратора';
    $('#atext').textContent = creating ? 'Минимум 4 символа. PIN хранится только в этом браузере.' : 'Введите PIN, чтобы редактировать расписание и нагрузку.';
    $('#ahint').textContent = '';
    $('#adminForm').reset();
    $('#adminDlg').showModal();
    $('#adminForm').elements.pin.focus();
  }

  async function submit(e) {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    const pin = $('#adminForm').elements.pin.value, saved = localStorage.getItem(PIN_KEY), h = await hash(pin);
    if (!saved) {
      if (pin.length < 4) { $('#ahint').textContent = 'PIN должен быть не короче 4 символов'; return; }
      localStorage.setItem(PIN_KEY, h);
    } else if (saved !== h) {
      $('#ahint').textContent = 'Неверный PIN';
      $('#adminDlg').classList.remove('shake'); void $('#adminDlg').offsetWidth; $('#adminDlg').classList.add('shake');
      return;
    }
    $('#adminDlg').close();
    apply(true);
    App.toast('Режим администратора включён');
  }

  $('#adminBtn').onclick = () => { if (document.body.dataset.admin === '1') { apply(false); App.toast('Режим просмотра'); } else ask(); };
  $('#adminForm').onsubmit = submit;
  apply(sessionStorage.getItem(SESSION_KEY) === '1');   // вкладка помнит вход до закрытия
  return { apply };
})();
