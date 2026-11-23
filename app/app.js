(function () {
  'use strict';

  var api = window.SousaCatalog;
  var screen = document.getElementById('screen');
  var navigation = document.getElementById('navigation');
  var player = document.getElementById('player');
  var video = document.getElementById('video');
  var playerPanel = document.getElementById('player-panel');
  var playerStatus = document.getElementById('player-status');
  var playerActions = document.getElementById('player-actions');
  var exitOverlay = document.getElementById('exit-overlay');
  var beforeExit;
  var tabs = { home: 'Início', search: 'Buscar', live: 'Ao vivo', movie: 'Filmes',
    series: 'Séries', favorites: 'Favoritos', settings: 'Configurações' };
  var source = read('source', null);
  var remembered = Boolean(source);
  var library = { favorites: {}, progress: {} };
  var catalog = [];
  var failures = [];
  var tab = 'home';
  var detail = null;
  var category = '';
  var search = '';
  var page = 0;
  var pageSize = 30;
  var playing = null;
  var playerTimer;
  var loadVersion = 0;
  var infoVersion = 0;
  var scrollTop = 0;
  var returnKey = '';

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem('sousatv.' + key)) || fallback; }
    catch (error) { return fallback; }
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem('sousatv.' + key);
      else localStorage.setItem('sousatv.' + key, JSON.stringify(value));
      return true;
    } catch (error) { return false; }
  }

  function libraryKey(account) {
    if (account.type === 'xtream') return 'xtream.' + account.url + ':' + encodeURIComponent(account.user);
    var hash = 0;
    for (var i = 0; i < account.url.length; i++) hash = (Math.imul(31, hash) + account.url.charCodeAt(i)) | 0;
    return 'm3u.' + hash;
  }

  function node(tag, value, className) {
    var element = document.createElement(tag);
    if (value != null) element.textContent = value;
    if (className) element.className = className;
    return element;
  }

  function button(label, handler, key, className) {
    var element = node('button', label, className);
    element.type = 'button';
    if (key) element.setAttribute('data-focus', key);
    element.onclick = handler;
    return element;
  }

  function findFocus(root, key) {
    var buttons = root.querySelectorAll('[data-focus]');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].getAttribute('data-focus') === key) return buttons[i];
    }
    return null;
  }

  function focusScreen(key) {
    var field = (key && findFocus(screen, key)) || screen.querySelector('button, input, select');
    if (field) field.focus();
  }

  function message(text, error) {
    var element = node('p', text, error ? 'error' : 'muted');
    element.setAttribute('role', 'status');
    return element;
  }

  function headings(title, subtitle) {
    screen.appendChild(node('h1', title));
    if (subtitle) screen.appendChild(message(subtitle));
  }

  function artwork(item) {
    var art = node('span', null, 'art');
    var initials = item.title.trim().slice(0, 2).toUpperCase();
    art.appendChild(node('span', initials || 'TV'));
    if (item.art) {
      var img = node('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { img.hidden = true; };
      img.src = item.art;
      art.appendChild(img);
    }
    return art;
  }

  function input(form, title, type, name, value) {
    var label = node('label', title);
    var field = node('input');
    field.type = type;
    field.name = name;
    field.value = value || '';
    field.required = true;
    field.autocomplete = 'off';
    field.setAttribute('autocapitalize', 'off');
    field.spellcheck = false;
    label.appendChild(field);
    form.appendChild(label);
    return field;
  }

  function login(editing, error) {
    navigation.hidden = !editing;
    screen.innerHTML = '';
    var form = node('form', null, 'login');
    form.noValidate = true;
    form.appendChild(node('h1', editing ? 'Trocar fonte' : 'Conectar à sua lista'));
    form.appendChild(message('Use os dados do seu serviço de IPTV.'));
    var sourceType = source ? source.type : 'xtream';
    var sourceChoices = node('div', null, 'actions');
    sourceChoices.setAttribute('role', 'group');
    sourceChoices.setAttribute('aria-label', 'Tipo de fonte');
    var xtream = button('Xtream Codes', function () { selectSource('xtream'); });
    var playlist = button('URL da lista M3U', function () { selectSource('m3u'); });
    sourceChoices.appendChild(xtream);
    sourceChoices.appendChild(playlist);
    form.appendChild(sourceChoices);
    var url = input(form, 'Endereço', 'url', 'url', source && source.url);
    var user = input(form, 'Usuário', 'text', 'user', source && source.user);
    var password = input(form, 'Senha', 'password', 'password', source && source.password);
    var checkLabel = node('label', null, 'checkbox');
    var remember = node('input');
    remember.type = 'checkbox';
    remember.checked = remembered;
    checkLabel.appendChild(remember);
    checkLabel.appendChild(document.createTextNode('Salvar dados de acesso nesta TV'));
    form.appendChild(checkLabel);
    var status = message(error || '', Boolean(error));
    form.appendChild(status);
    var actions = node('div', null, 'actions');
    var submit = node('button', 'Conectar', 'primary');
    submit.type = 'submit';
    actions.appendChild(submit);
    if (editing) actions.appendChild(button('Cancelar', function () { go('settings'); }));
    form.appendChild(actions);
    function selectSource(type) {
      sourceType = type;
      var m3u = type === 'm3u';
      xtream.setAttribute('aria-pressed', String(!m3u));
      playlist.setAttribute('aria-pressed', String(m3u));
      user.parentNode.hidden = m3u;
      password.parentNode.hidden = m3u;
      url.placeholder = m3u ? 'https://servidor.exemplo/lista.m3u' : 'https://servidor.exemplo';
    }
    form.onsubmit = function (event) {
      event.preventDefault();
      var account;
      try {
        if (sourceType === 'm3u') {
          account = { type: 'm3u', url: api.httpUrl(url.value.trim()) };
          if (!account.url) throw new Error('Informe um endereço HTTP ou HTTPS válido para a lista.');
        } else {
          if (!api.httpUrl(url.value.trim())) throw new Error('Informe um endereço HTTP ou HTTPS válido.');
          account = { type: 'xtream', url: api.serverUrl(url.value), user: user.value.trim(), password: password.value };
          if (!account.user || !account.password) throw new Error('Preencha usuário e senha.');
        }
      } catch (problem) {
        status.className = 'error';
        status.textContent = problem.message;
        return;
      }
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = 'Carregando catálogo…';
      var version = ++loadVersion;
      api.load(account).then(function (result) {
        if (version !== loadVersion || !screen.contains(form)) return;
        remembered = remember.checked;
        var storageOk = store('source', remembered ? account : null);
        activate(account, result);
        if (!storageOk) screen.insertBefore(message('O armazenamento da TV está indisponível.', true), screen.firstChild);
      }).catch(function (problem) {
        if (version !== loadVersion || !screen.contains(form)) return;
        submit.disabled = false;
        status.className = 'error';
        status.textContent = problem.message;
        submit.focus();
      });
    };
    selectSource(sourceType);
    screen.appendChild(form);
    (sourceType === 'm3u' ? playlist : xtream).focus();
  }

  function activate(account, result) {
    source = account;
    library = read(libraryKey(account), { favorites: {}, progress: {} });
    catalog = result.items;
    failures = result.failures;
    go('home');
  }

  function go(target) {
    infoVersion++;
    tab = target;
    detail = null;
    category = '';
    search = '';
    page = 0;
    screen.scrollTop = 0;
    render();
    var selected = findFocus(navigation, target);
    if (selected) selected.focus();
  }

  function renderNav() {
    navigation.innerHTML = '';
    navigation.hidden = false;
    Object.keys(tabs).forEach(function (key) {
      var element = button(tabs[key], function () { go(key); }, key);
      if (tab === key) element.setAttribute('aria-current', 'page');
      navigation.appendChild(element);
    });
  }

  function card(item) {
    var element = button(null, function () {
      if (item.kind === 'episode') openResume(item);
      else openDetail(item);
    }, item.key, 'card ' + item.kind);
    element.title = item.title;
    element.appendChild(artwork(item));
    element.appendChild(node('span', item.title, 'card-title'));
    return element;
  }

  function grid(container, items) {
    if (!items.length) {
      container.appendChild(message('Nenhum item encontrado.'));
      return;
    }
    var maxPage = Math.ceil(items.length / pageSize) - 1;
    page = Math.min(page, maxPage);
    var cards = node('div', null, 'cards');
    items.slice(page * pageSize, (page + 1) * pageSize).forEach(function (item) {
      cards.appendChild(card(item));
    });
    container.appendChild(cards);
    if (maxPage) {
      var actions = node('div', null, 'actions');
      function turn(offset) {
        page += offset;
        render();
        screen.scrollTop = 0;
        focusScreen();
        var first = screen.querySelector('.card');
        if (first) first.focus();
      }
      if (page) actions.appendChild(button('Página anterior', function () { turn(-1); }));
      if (page < maxPage) actions.appendChild(button('Próxima página', function () { turn(1); }));
      actions.appendChild(node('span', 'Página ' + (page + 1) + ' de ' + (maxPage + 1), 'metadata'));
      container.appendChild(actions);
    }
  }

  function filtered(items, term) {
    term = term.toLowerCase().trim();
    return term ? items.filter(function (item) {
      return [item.title, item.genre, item.plot, item.cast].join(' ').toLowerCase().indexOf(term) !== -1;
    }) : items;
  }

  function renderSearch(items) {
    headings('Buscar');
    var form = node('form', null, 'actions search');
    var field = input(form, 'Nome, gênero, elenco ou sinopse', 'search', 'search', search);
    field.required = false;
    field.setAttribute('data-focus', 'search-input');
    var submit = node('button', 'Buscar', 'primary');
    submit.type = 'submit';
    form.appendChild(submit);
    form.onsubmit = function (event) {
      event.preventDefault();
      search = field.value;
      page = 0;
      render();
      focusScreen('search-input');
      var first = screen.querySelector('.card');
      if (search && first) first.focus();
    };
    screen.appendChild(form);
    if (search.trim()) grid(screen, filtered(items, search));
  }

  function renderCatalog() {
    var section = api.sections[tab];
    headings(section.label, failures.indexOf(section.label) >= 0 ? 'O servidor não entregou este catálogo. Tente atualizar em Configurações.' : '');
    var items = catalog.filter(function (item) { return item.kind === tab; });
    var groups = Object.create(null);
    items.forEach(function (item) { groups[item.group] = true; });
    var layout = node('div', null, 'layout');
    var sidebar = node('aside', null, 'categories');
    var results = node('section', null, 'results');
    [null].concat(Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); }))
      .forEach(function (group, index) {
        var key = 'group-' + index;
        var selector = button(group || 'Todas', function () {
          category = group || '';
          page = 0;
          var sideScroll = sidebar.scrollTop;
          render();
          var newSidebar = screen.querySelector('.categories');
          newSidebar.scrollTop = sideScroll;
          focusScreen(key);
        }, key);
        if (category === (group || '')) selector.setAttribute('aria-pressed', 'true');
        sidebar.appendChild(selector);
      });
    layout.appendChild(sidebar);
    layout.appendChild(results);
    screen.appendChild(layout);
    grid(results, category ? items.filter(function (item) { return item.group === category; }) : items);
  }

  function renderHome() {
    headings('Continuar assistindo', failures.length ? 'Catálogo parcial: ' + failures.join(', ') + '.' : '');
    var items = Object.keys(library.progress).map(function (key) { return library.progress[key]; })
      .sort(function (a, b) { return b.updated - a.updated; })
      .map(function (entry) {
        if (entry.kind === 'episode') {
          var series = catalogByKey(entry.seriesKey);
          return series ? { key: entry.key, kind: entry.kind, title: entry.title,
            seriesKey: entry.seriesKey, art: series.art } : null;
        }
        return catalogByKey(entry.key);
      }).filter(Boolean);
    if (items.length) grid(screen, items);
    else screen.appendChild(message('Filmes e episódios em andamento aparecem aqui.'));
  }

  function catalogByKey(key) {
    for (var i = 0; i < catalog.length; i++) if (catalog[i].key === key) return catalog[i];
    return null;
  }

  function renderSettings() {
    headings('Configurações', source.type === 'xtream' ? 'Fonte conectada: Xtream Codes' : 'Fonte conectada: lista M3U');
    var actions = node('div', null, 'actions');
    var status = message('');
    var reload = button('Atualizar catálogo', function () {
      var account = source;
      var version = ++loadVersion;
      reload.disabled = true;
      status.textContent = 'Atualizando…';
      api.load(account).then(function (result) {
        if (version !== loadVersion || account !== source) return;
        catalog = result.items;
        failures = result.failures;
        if (screen.contains(status)) {
          status.className = 'muted';
          status.textContent = failures.length ? 'Atualizado parcialmente: ' + failures.join(', ') + '.' : 'Catálogo atualizado.';
          reload.disabled = false;
          reload.focus();
        }
      }).catch(function (error) {
        if (version !== loadVersion || !screen.contains(status)) return;
        status.className = 'error';
        status.textContent = error.message;
        reload.disabled = false;
        reload.focus();
      });
    });
    actions.appendChild(reload);
    actions.appendChild(button('Trocar fonte', function () { login(true); }));
    actions.appendChild(button('Desconectar', function () {
      loadVersion++;
      source = null;
      remembered = false;
      catalog = [];
      store('source', null);
      login(false);
    }));
    screen.appendChild(actions);
    screen.appendChild(status);
    screen.appendChild(message('Sousa TV 1.0.0'));
  }

  function render() {
    renderNav();
    screen.innerHTML = '';
    if (detail) { renderDetail(); return; }
    if (tab === 'home') { renderHome(); return; }
    if (tab === 'search') { renderSearch(catalog); return; }
    if (tab === 'favorites') {
      headings('Favoritos');
      grid(screen, catalog.filter(function (item) { return library.favorites[item.key]; }));
      return;
    }
    if (tab === 'settings') { renderSettings(); return; }
    renderCatalog();
  }

  function openDetail(item) {
    returnKey = item.key;
    scrollTop = screen.scrollTop;
    detail = { item: item, data: {}, loading: source.type === 'xtream' };
    render();
    screen.scrollTop = 0;
    focusScreen(item.kind === 'series' ? 'favorite' : 'play');
    var version = ++infoVersion;
    api.detail(source, item).then(function (data) {
      if (version !== infoVersion || !detail || detail.item !== item) return;
      detail.data = data;
      detail.loading = false;
      var key = document.activeElement.getAttribute('data-focus');
      if (!playing) { render(); focusScreen(key); }
    }).catch(function () {
      if (version !== infoVersion || !detail || detail.item !== item) return;
      detail.loading = false;
      detail.error = true;
      var key = document.activeElement.getAttribute('data-focus');
      if (!playing) { render(); focusScreen(key); }
    });
  }

  function closeDetail() {
    infoVersion++;
    detail = null;
    render();
    screen.scrollTop = scrollTop;
    focusScreen(returnKey);
  }

  function time(value) {
    var seconds = Math.floor(value) % 60;
    var minutes = Math.floor(value / 60) % 60;
    var hours = Math.floor(value / 3600);
    return (hours ? hours + ':' : '') + ('0' + minutes).slice(-2) + ':' + ('0' + seconds).slice(-2);
  }

  function playbackLabel(item) {
    var entry = library.progress[item.key];
    return entry ? 'Continuar em ' + time(entry.position) : 'Assistir';
  }

  function decodeProgram(value) {
    try {
      var bytes = atob(value);
      return decodeURIComponent(bytes.split('').map(function (letter) {
        return '%' + ('00' + letter.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (error) { return value; }
  }

  function renderDetail() {
    var item = detail.item;
    var data = detail.data;
    var back = button('Voltar', closeDetail, 'detail-back');
    var bar = node('div', null, 'actions');
    bar.appendChild(back);
    screen.appendChild(bar);
    var layout = node('div', null, 'detail');
    var body = node('div', null, 'detail-body');
    layout.appendChild(artwork(item));
    layout.appendChild(body);
    screen.appendChild(layout);
    body.appendChild(node('h1', item.title));
    var actions = node('div', null, 'actions');
    if (item.kind !== 'series') actions.appendChild(button(playbackLabel(item), function () { play(item, null); }, 'play', 'primary'));
    var favorite = button(library.favorites[item.key] ? 'Remover dos favoritos' : 'Adicionar aos favoritos', function () {
      if (library.favorites[item.key]) delete library.favorites[item.key];
      else library.favorites[item.key] = true;
      store(libraryKey(source), library);
      render();
      focusScreen('favorite');
    }, 'favorite');
    actions.appendChild(favorite);
    body.appendChild(actions);
    var meta = [item.group, data.genre || item.genre, data.releaseDate, data.duration].filter(Boolean);
    if (meta.length) body.appendChild(message(meta.join(' · ')));
    if (data.plot || data.description || item.plot) body.appendChild(node('p', data.plot || data.description || item.plot));
    if (data.cast || item.cast) body.appendChild(message('Elenco: ' + (data.cast || item.cast)));
    if (detail.loading) body.appendChild(message('Carregando detalhes…'));
    if (detail.error) body.appendChild(message('O servidor não retornou os detalhes.', true));
    if (data.programs && data.programs.length) {
      body.appendChild(node('h2', 'Programação'));
      data.programs.forEach(function (program) {
        if (!program || !program.title) return;
        var start = String(program.start || '').match(/\b\d{2}:\d{2}/);
        body.appendChild(message((start ? start[0] + ' · ' : '') + decodeProgram(program.title)));
      });
    }
    if (data.seasons) {
      if (!data.seasons.length) body.appendChild(message('Nenhum episódio disponível.'));
      var episodes = node('div', null, 'episodes');
      data.seasons.forEach(function (season) {
        episodes.appendChild(node('h2', 'Temporada ' + season.number));
        season.episodes.forEach(function (episode, index) {
          var progress = library.progress[episode.key];
          var label = episode.label + (progress ? ' · Continuar em ' + time(progress.position) : '');
          episodes.appendChild(button(label, function () {
            play(episode, season.episodes[index + 1] || null, season.episodes);
          }, episode.key));
        });
      });
      body.appendChild(episodes);
    }
  }

  function saveProgress() {
    if (!playing || playing.item.kind === 'live' || !playing.started || !isFinite(video.currentTime)) return;
    var item = playing.item;
    var ended = video.ended || (isFinite(video.duration) && video.duration - video.currentTime <= 3);
    if (ended) delete library.progress[item.key];
    else if (video.currentTime >= 5) {
      var entry = { key: item.key, kind: item.kind, title: item.title,
        position: video.currentTime, updated: Date.now() };
      if (item.kind === 'episode') entry.seriesKey = item.seriesKey;
      library.progress[item.key] = entry;
    }
    store(libraryKey(source), library);
  }

  function refreshPanel(focus) {
    playerActions.innerHTML = '';
    playerActions.appendChild(button(video.paused ? 'Reproduzir' : 'Pausar', togglePlayback, 'toggle', 'primary'));
    if (playing.item.kind !== 'live') {
      playerActions.appendChild(button('−10 s', function () { seek(-10); }, 'earlier'));
      playerActions.appendChild(button('+30 s', function () { seek(30); }, 'later'));
    }
    if (playing.next) playerActions.appendChild(button('Próximo episódio', nextEpisode, 'next'));
    playerActions.appendChild(button('Voltar ao catálogo', closePlayer, 'close'));
    if (focus) (findFocus(playerActions, focus) || playerActions.firstChild).focus();
  }

  function showPanel(forceFocus) {
    clearTimeout(playerTimer);
    playerPanel.hidden = false;
    if (forceFocus) playerActions.firstChild.focus();
    if (!video.paused && !playing.error) {
      playerTimer = setTimeout(function () { playerPanel.hidden = true; }, 7000);
    }
  }

  function videoError() {
    if (!playing) return;
    playing.error = true;
    playerStatus.textContent = 'Não foi possível reproduzir. Confira o formato do vídeo e a conexão com o provedor.';
    showPanel(false);
  }

  function requestPlayback() {
    var attempt = playing;
    var promise = video.play();
    if (promise && promise.catch) {
      promise.catch(function (error) {
        if (playing !== attempt || error.name === 'AbortError') return;
        if (error.name === 'NotAllowedError') {
          playerStatus.textContent = 'Selecione Reproduzir para iniciar.';
          showPanel(true);
          return;
        }
        videoError();
      });
    }
  }

  function togglePlayback() {
    if (video.paused) requestPlayback();
    else video.pause();
  }

  function seek(amount) {
    if (!isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + amount));
  }

  function play(item, next, episodes) {
    saveProgress();
    var previous = playing;
    playing = { item: item, next: next, episodes: episodes,
      focusKey: previous ? previous.focusKey : document.activeElement.getAttribute('data-focus') };
    player.hidden = false;
    screen.hidden = true;
    navigation.hidden = true;
    document.getElementById('playing-title').textContent = item.title;
    playerStatus.textContent = 'Abrindo transmissão…';
    video.src = item.url;
    refreshPanel('toggle');
    showPanel(false);
    requestPlayback();
  }

  function openResume(entry) {
    var series = catalogByKey(entry.seriesKey);
    if (!series) return;
    var version = ++infoVersion;
    var account = source;
    var notice = message('Carregando episódio…');
    screen.insertBefore(notice, screen.firstChild);
    api.detail(account, series).then(function (data) {
      if (version !== infoVersion || account !== source) return;
      if (notice.parentNode) notice.parentNode.removeChild(notice);
      var seasons = data.seasons || [];
      for (var i = 0; i < seasons.length; i++) {
        var episodes = seasons[i].episodes;
        for (var j = 0; j < episodes.length; j++) {
          if (episodes[j].key === entry.key) {
            play(episodes[j], episodes[j + 1] || null, episodes);
            return;
          }
        }
      }
      screen.insertBefore(message('Este episódio não está disponível no catálogo atual.', true), screen.firstChild);
    }).catch(function () {
      if (version !== infoVersion || !notice.parentNode) return;
      notice.className = 'error';
      notice.textContent = 'O servidor não entregou os episódios.';
    });
  }

  function nextEpisode() {
    var episodes = playing.episodes || [];
    var next = playing.next;
    play(next, episodes[episodes.indexOf(next) + 1] || null, episodes);
  }

  function closePlayer() {
    if (!playing) return;
    saveProgress();
    var key = playing.focusKey;
    playing = null;
    clearTimeout(playerTimer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    player.hidden = true;
    screen.hidden = false;
    render();
    focusScreen(key);
  }

  video.addEventListener('playing', function () {
    if (!playing) return;
    playing.started = true;
    playing.error = false;
    playerStatus.textContent = '';
    refreshPanel(document.activeElement.getAttribute('data-focus'));
    showPanel(!playerActions.contains(document.activeElement) && !playerPanel.hidden);
  });
  video.addEventListener('pause', function () {
    if (!playing || video.ended || !playing.started) return;
    saveProgress();
    refreshPanel(document.activeElement.getAttribute('data-focus'));
    showPanel(!playerActions.contains(document.activeElement));
  });
  video.addEventListener('loadedmetadata', function () {
    if (!playing) return;
    var entry = library.progress[playing.item.key];
    if (entry && entry.position < video.duration - 3) {
      try { video.currentTime = entry.position; } catch (error) { /* Seeking is optional. */ }
    }
  });
  video.addEventListener('timeupdate', function () {
    if (playing && playing.item.kind !== 'live' && Date.now() - (playing.saved || 0) > 10000) {
      playing.saved = Date.now();
      saveProgress();
    }
  });
  video.addEventListener('ended', function () {
    if (!playing) return;
    saveProgress();
    if (playing.next) nextEpisode();
    else closePlayer();
  });
  video.addEventListener('error', videoError);
  player.addEventListener('mousemove', function () { if (playing) showPanel(false); });
  video.addEventListener('click', function () { if (playing) showPanel(true); });
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', function () {
    if (!playing || !document.hidden) return;
    saveProgress();
    video.pause();
  });

  function cancelExit() {
    exitOverlay.hidden = true;
    if (beforeExit && beforeExit !== document.body) beforeExit.focus();
    else focusScreen();
  }

  document.getElementById('stay').onclick = cancelExit;
  document.getElementById('leave').onclick = function () { window.close(); };

  function back() {
    if (!exitOverlay.hidden) { cancelExit(); return; }
    if (playing) { closePlayer(); return; }
    if (detail) { closeDetail(); return; }
    if (source && !navigation.hidden && (tab !== 'home' || screen.querySelector('form.login'))) {
      go(screen.querySelector('form.login') ? 'settings' : 'home');
      return;
    }
    beforeExit = document.activeElement;
    exitOverlay.hidden = false;
    document.getElementById('stay').focus();
  }

  function spatialFocus(code) {
    var active = document.activeElement;
    var root = playing ? playerActions : exitOverlay.hidden ? document : exitOverlay;
    var candidates = root.querySelectorAll('button, input, select');
    if (!root.contains(active) || active === document.body) {
      if (playing) showPanel(true);
      else focusScreen();
      return;
    }
    var current = active.getBoundingClientRect();
    var horizontal = code === 37 || code === 39;
    var sign = code === 37 || code === 38 ? -1 : 1;
    var best;
    var bestScore = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      if (active === candidate || candidate.disabled || !candidate.getClientRects().length) continue;
      var rect = candidate.getBoundingClientRect();
      var dx = (rect.left + rect.right - current.left - current.right) / 2;
      var dy = (rect.top + rect.bottom - current.top - current.bottom) / 2;
      var mainDistance = sign * (horizontal ? dx : dy);
      if (mainDistance <= 2) continue;
      var perpendicular = horizontal
        ? Math.max(0, rect.top - current.bottom, current.top - rect.bottom)
        : Math.max(0, rect.left - current.right, current.left - rect.right);
      var centerOffset = Math.abs(horizontal ? dy : dx);
      var score = mainDistance + perpendicular * 2.4 + centerOffset * .1 +
        (perpendicular > mainDistance * 1.3 ? 550 : 0);
      if (score < bestScore) { bestScore = score; best = candidate; }
    }
    if (best) best.focus();
  }

  window.addEventListener('keydown', function (event) {
    var code = event.keyCode;
    var active = document.activeElement;
    if (code === 461 || code === 27 || code === 10009) {
      event.preventDefault();
      if (!event.repeat) back();
      return;
    }
    if (playing && (code === 415 || code === 19 || code === 179 || code === 413)) {
      event.preventDefault();
      if (code === 413) closePlayer();
      if (code === 415 && video.paused) requestPlayback();
      if (code === 19) video.pause();
      if (code === 179) togglePlayback();
      return;
    }
    if (playing && playerPanel.hidden && (code === 13 || (code >= 37 && code <= 40))) {
      event.preventDefault();
      showPanel(true);
      return;
    }
    if (code < 37 || code > 40) return;
    if (active.tagName === 'INPUT' && active.type !== 'checkbox' && (code === 37 || code === 39)) return;
    event.preventDefault();
    if (playing) showPanel(false);
    spatialFocus(code);
  });

  if (source) {
    var startingSource = source;
    headings('Sousa TV', 'Conectando à sua lista…');
    api.load(startingSource).then(function (result) { activate(startingSource, result); })
      .catch(function (problem) { login(false, problem.message); });
  } else login(false);
}());
