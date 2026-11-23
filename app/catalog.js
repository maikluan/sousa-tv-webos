(function () {
  'use strict';

  var sections = {
    live: { label: 'Ao vivo', categories: 'get_live_categories', streams: 'get_live_streams' },
    movie: { label: 'Filmes', categories: 'get_vod_categories', streams: 'get_vod_streams' },
    series: { label: 'Séries', categories: 'get_series_categories', streams: 'get_series' }
  };

  function httpUrl(value, base) {
    try {
      var url = new URL(value, base || undefined);
      if (/^https?:$/.test(url.protocol) && !url.username && !url.password) return url.href;
    } catch (error) {
      return '';
    }
    return '';
  }

  function serverUrl(value) {
    var url = new URL(httpUrl(value.trim()));
    if (url.search || url.hash) throw new Error('Informe apenas o endereço do servidor.');
    return url.href.replace(/\/+$/, '');
  }

  function query(values) {
    return Object.keys(values).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(values[key]);
    }).join('&');
  }

  function request(url, asJson) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.timeout = 25000;
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error('O servidor respondeu com HTTP ' + xhr.status + '.'));
          return;
        }
        try {
          resolve(asJson ? JSON.parse(xhr.responseText) : { body: xhr.responseText, url: xhr.responseURL || url });
        } catch (error) {
          reject(new Error('O servidor enviou uma resposta inválida.'));
        }
      };
      xhr.onerror = function () { reject(new Error('Falha de rede. Confira a conexão e se o servidor permite solicitações do app (CORS).')); };
      xhr.ontimeout = function () { reject(new Error('O servidor demorou para responder. Tente novamente.')); };
      xhr.send();
    });
  }

  function api(source, action, parameters) {
    var values = { username: source.user, password: source.password };
    if (action) values.action = action;
    Object.keys(parameters || {}).forEach(function (key) { values[key] = parameters[key]; });
    return request(source.url + '/player_api.php?' + query(values), true);
  }

  function extension(value, fallback) {
    return /^[a-z0-9]{1,8}$/i.test(value || '') ? value : fallback;
  }

  function stream(source, kind, id, ext) {
    return source.url + '/' + kind + '/' +
      [source.user, source.password, id].map(encodeURIComponent).join('/') + '.' + ext;
  }

  function array(value) {
    return Array.isArray(value) ? value : [];
  }

  function xtreamItems(source, kind, rows, categories, liveFormats) {
    var groups = Object.create(null);
    array(categories).forEach(function (category) {
      if (category) groups[String(category.category_id)] = category.category_name;
    });
    var base = source.url + '/';
    return array(rows).filter(function (row) {
      return row && (kind === 'series' ? row.series_id : row.stream_id) != null;
    }).map(function (row) {
      var id = String(kind === 'series' ? row.series_id : row.stream_id);
      return {
        key: kind + ':' + id,
        kind: kind,
        id: id,
        title: String(row.name || row.title || 'Sem título'),
        group: String(groups[String(row.category_id)] || 'Outros'),
        art: row.stream_icon || row.cover ? httpUrl(row.stream_icon || row.cover, base) : '',
        plot: String(row.plot || ''),
        genre: String(row.genre || ''),
        cast: String(row.cast || ''),
        url: kind === 'series' ? '' : stream(source, kind, id,
          kind === 'live' ? liveFormats[0] : extension(row.container_extension, 'mp4')),
        alternateUrl: kind === 'live' ? stream(source, kind, id, liveFormats[1]) : ''
      };
    });
  }

  function playlist(response, source) {
    var items = [];
    var pending;
    var group;
    var seen = Object.create(null);
    response.body.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(function (rawLine) {
      var line = rawLine.trim();
      if (/^#EXTINF:/i.test(line)) {
        var attrs = Object.create(null);
        var metadata = line.match(/^#EXTINF:(?:"[^"]*"|[^",])*/i)[0];
        metadata.replace(/([\w-]+)\s*=\s*"([^"]*)"/g, function (_, key, value) {
          attrs[key.toLowerCase()] = value;
        });
        pending = { title: line.slice(metadata.length + 1).trim() || attrs['tvg-name'],
          art: attrs['tvg-logo'], group: attrs['group-title'] };
        group = '';
        return;
      }
      if (/^#EXTGRP:/i.test(line)) group = line.slice(8).trim();
      if (!line || line.charAt(0) === '#') return;
      var url = pending && httpUrl(line, response.url);
      if (url && !seen[url]) {
        seen[url] = true;
        var isMovie = /\/movie\/|\.(mp4|mkv|webm|avi|mov)(?:[?#]|$)/i.test(url);
        var kind = isMovie ? 'movie' : 'live';
        var hash = 0;
        for (var i = 0; i < url.length; i++) hash = (Math.imul(31, hash) + url.charCodeAt(i)) | 0;
        items.push({ key: 'm3u:' + kind + ':' + String(hash), kind: kind,
          title: pending.title || 'Sem título', group: pending.group || group || 'Outros',
          art: pending.art ? httpUrl(pending.art, response.url) : '',
          url: url });
      }
      pending = null;
      group = '';
    });
    if (!items.length && !/#EXT-X-/i.test(response.body)) throw new Error('A lista não contém entradas IPTV válidas.');
    if (!items.length) items.push({ key: 'm3u:single', kind: 'live', title: 'Transmissão HLS',
      group: 'Outros', art: '', url: source.url });
    return items;
  }

  function load(source) {
    if (source.type === 'm3u') {
      return request(source.url, false).then(function (response) {
        return { items: playlist(response, source), failures: [] };
      });
    }
    return api(source).then(function (login) {
      if (!login || !login.user_info || String(login.user_info.auth) !== '1' ||
          (login.user_info.status && String(login.user_info.status).toLowerCase() !== 'active')) {
        throw new Error('Credenciais recusadas ou conta inativa. Confira os dados com seu provedor.');
      }
      var advertised = array(login.user_info.allowed_output_formats).map(function (value) {
        return String(value).toLowerCase();
      });
      var liveFormats = advertised.indexOf('ts') >= 0 && advertised.indexOf('m3u8') < 0
        ? ['ts', 'm3u8'] : ['m3u8', 'ts'];
      return Promise.all(Object.keys(sections).map(function (kind) {
        var config = sections[kind];
        return Promise.all([
          api(source, config.streams),
          api(source, config.categories).catch(function () { return []; })
        ]).then(function (results) {
          if (!Array.isArray(results[0])) throw new Error('Catálogo inválido.');
          return { items: xtreamItems(source, kind, results[0], results[1], liveFormats) };
        }).catch(function () {
          return { items: [], failure: config.label };
        });
      }));
    }).then(function (parts) {
      var result = { items: [], failures: [] };
      parts.forEach(function (part) {
        result.items = result.items.concat(part.items);
        if (part.failure) result.failures.push(part.failure);
      });
      if (result.failures.length === 3) throw new Error('O servidor aceitou o login, mas não entregou o catálogo.');
      return result;
    });
  }

  function detail(source, item) {
    if (source.type !== 'xtream') return Promise.resolve({});
    if (item.kind === 'movie') {
      return api(source, 'get_vod_info', { vod_id: item.id }).then(function (response) {
        return response.info || {};
      });
    }
    if (item.kind === 'live') {
      return api(source, 'get_short_epg', { stream_id: item.id, limit: 5 }).then(function (response) {
        return { programs: array(response.epg_listings) };
      });
    }
    return api(source, 'get_series_info', { series_id: item.id }).then(function (response) {
      var detailInfo = response.info || {};
      var seasons = response.episodes || {};
      detailInfo.seasons = Object.keys(seasons).sort(function (a, b) { return Number(a) - Number(b); })
        .map(function (season) {
          return { number: season, episodes: array(seasons[season]).filter(function (row) {
            return row && row.id != null;
          }).map(function (row, index) {
            return {
              key: item.key + ':' + row.id,
              kind: 'episode', seriesKey: item.key,
              title: item.title + ' · T' + season + 'E' + (row.episode_num || index + 1),
              label: String(row.title || 'Episódio ' + (row.episode_num || index + 1)),
              art: item.art,
              url: stream(source, 'series', row.id, extension(row.container_extension, 'mp4'))
            };
          }) };
        }).filter(function (season) { return season.episodes.length; });
      return detailInfo;
    });
  }

  window.SousaCatalog = { sections: sections, httpUrl: httpUrl, serverUrl: serverUrl, load: load, detail: detail };
}());
