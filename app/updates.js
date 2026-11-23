(function () {
  'use strict';

  var current = document.querySelector('meta[name="sousa-version"]').content;
  var endpoint = 'https://api.github.com/repos/maikluan/sousa-tv-webos/releases/latest';

  function components(version) {
    var match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
    return match ? match.slice(1).map(Number) : null;
  }

  function isNewer(candidate, installed) {
    for (var i = 0; i < candidate.length; i++) {
      if (candidate[i] !== installed[i]) return candidate[i] > installed[i];
    }
    return false;
  }

  function check() {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      function unavailable() { reject(new Error('Falha ao consultar o GitHub. Tente novamente.')); }
      xhr.open('GET', endpoint);
      xhr.timeout = 12000;
      xhr.onerror = unavailable;
      xhr.ontimeout = unavailable;
      xhr.onload = function () {
        try {
          if (xhr.status !== 200) return unavailable();
          var release = JSON.parse(xhr.responseText);
          var latest = components(release.tag_name);
          if (!latest || release.draft || release.prerelease) return unavailable();
          var version = latest.join('.');
          var expected = 'com.sousatv.player_' + version + '_all.ipk';
          if (!Array.isArray(release.assets) || !release.assets.some(function (asset) {
            return asset.name === expected;
          })) return unavailable();
          resolve({ version: version, newer: isNewer(latest, components(current)) });
        } catch (error) {
          unavailable();
        }
      };
      xhr.send();
    });
  }

  window.SousaUpdates = { version: current, check: check };
}());
