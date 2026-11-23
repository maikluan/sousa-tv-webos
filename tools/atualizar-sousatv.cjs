'use strict';

const { createHash } = require('node:crypto');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const app = 'com.sousatv.player';
const repository = 'maikluan/sousa-tv-webos';
const device = process.argv[2] || 'lg-sousa';
const userTools = join(process.env.LOCALAPPDATA || '', 'SousaTV');
const cli = process.env.SOUSA_WEBOS_CLI || join(userTools, 'cli', 'node_modules', '@webos-tools', 'cli');
const versionPattern = /^\d+\.\d+\.\d+$/;

function ares(command, args) {
  const script = join(cli, 'bin', 'ares-' + command + '.js');
  const reply = spawnSync(process.execPath, [script, '--device', device, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
  });
  if (reply.error || reply.status !== 0) {
    throw new Error('Falha no CLI da LG. Confira se a TV está ligada e o Developer Mode está ativo.\n' +
      (reply.error?.message || reply.stderr || reply.stdout || '').trim());
  }
  return reply.stdout || '';
}

function installedVersion() {
  const listings = ares('install', ['--listfull']);
  const entry = listings.split(/^[ \t]*id[ \t]*:[ \t]*/m).find(part => part.split(/\r?\n/, 1)[0].trim() === app);
  if (!entry) return null;
  const version = entry.match(/^[ \t]*version[ \t]*:[ \t]*(\S+)/m)?.[1];
  if (!versionPattern.test(version || '')) throw new Error('Não foi possível identificar a versão instalada.');
  return version;
}

function newer(candidate, installed) {
  const current = installed.split('.').map(Number);
  const available = candidate.split('.').map(Number);
  for (let i = 0; i < available.length; i++) {
    if (available[i] !== current[i]) return available[i] > current[i];
  }
  return false;
}

async function main() {
  const response = await fetch('https://api.github.com/repos/' + repository + '/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Falha ao consultar a versão no GitHub (HTTP ' + response.status + ').');
  const release = await response.json();
  const version = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name)?.[1];
  if (!version || release.draft || release.prerelease) throw new Error('Versão publicada inválida.');

  const installed = installedVersion();
  if (installed && !newer(version, installed)) {
    console.log('Sousa TV ' + installed + ' já está atualizado nesta LG.');
    return;
  }

  const filename = app + '_' + version + '_all.ipk';
  const url = 'https://github.com/' + repository + '/releases/download/v' + version + '/' + filename;
  const asset = release.assets?.find(file => file.name === filename && file.state === 'uploaded');
  if (!asset || asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 25 * 1024 * 1024) {
    throw new Error('O pacote da versão publicada não pode ser verificado.');
  }

  console.log('Baixando o Sousa TV ' + version + '…');
  const download = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!download.ok) throw new Error('Falha no download do Sousa TV (HTTP ' + download.status + ').');
  const data = Buffer.from(await download.arrayBuffer());
  if (data.length !== asset.size || 'sha256:' + createHash('sha256').update(data).digest('hex') !== asset.digest) {
    throw new Error('O IPK baixado não corresponde ao arquivo publicado.');
  }

  const dir = await mkdtemp(join(tmpdir(), 'sousatv-update-'));
  const path = join(dir, filename);
  try {
    await writeFile(path, data);
    console.log('Instalando na LG…');
    ares('install', [path]);
    if (installedVersion() !== version) throw new Error('A versão esperada não apareceu na TV após instalar.');
    ares('launch', [app]);
    console.log('Sousa TV ' + version + ' instalado e aberto na LG.');
  } finally {
    await rm(path, { force: true });
    await rm(dir);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
