# Sousa TV para LG webOS

Player de IPTV em português para Smart TVs LG com webOS. Use o controle remoto para navegar pelo catálogo da sua própria fonte Xtream Codes ou M3U.

- Canais ao vivo, filmes e séries por categoria. Em fontes Xtream, a tela de canal exibe a programação quando o servidor a fornece. Séries Xtream exibem temporadas, episódios e reprodução automática do próximo episódio da temporada.
- Busca pelos dados disponíveis no catálogo, favoritos e retomada de filmes e episódios.
- Reprodução pelo player do webOS. A compatibilidade depende do modelo da TV e dos formatos usados pelo provedor. Para canais Xtream, o app alterna entre HLS (.m3u8) e MPEG-TS (.ts) quando necessário e prefere o último formato que funcionou para a fonte na sessão.
- O app vem sem listas ou assinaturas. Use uma fonte à qual você tenha acesso autorizado.

O aplicativo foi escrito para webOS, com o [Tarta TV para Android](https://github.com/rodolfot/iptv) como referência funcional. Código, imagens e marca do aplicativo Android não integram este projeto. Esta versão cobre os recursos acima. Recursos do Android como PIN parental, perfis múltiplos, time-shift e PiP ficam fora desta versão.

## Instalação na TV LG pelo Windows

### 1. Baixe o pacote

Na [versão mais recente](https://github.com/maikluan/sousa-tv-webos/releases/latest), baixe o arquivo **com.sousatv.player_…_all.ipk** para a pasta Downloads.

### 2. Ative o Developer Mode na TV

1. Conecte a TV e o computador à mesma rede local. Anote o IP da TV nas configurações de rede.
2. Abra **LG Apps** ou **LG Content Store** na TV, procure **Developer Mode** e instale o aplicativo.
3. Entre com sua conta do [portal LG Developer](https://webostv.developer.lge.com/). Ligue **Dev Mode Status** e aguarde a reinicialização.
4. Abra novamente o **Developer Mode**. Deixe a TV nessa tela.

### 3. Prepare o computador

Instale o [Node.js LTS](https://nodejs.org/en/download), abra um novo PowerShell e execute:

```powershell
npm.cmd install -g @webos-tools/cli
ares.cmd -V
ares-config.cmd --profile tv
```

### 4. Autorize o computador na TV

No PowerShell, substitua **192.168.1.50** pelo IP real da sua LG:

```powershell
ares-setup-device.cmd --add lg-sousa -i "host=192.168.1.50" -i "port=9922" -i "username=prisoner"
```

Na TV, ligue **Key Server** dentro de **Developer Mode**. De volta ao PowerShell, rode o primeiro comando a seguir e digite a **Passphrase** de seis caracteres que aparece na TV, respeitando maiúsculas e minúsculas. Rode o segundo comando para confirmar a conexão.

```powershell
ares-novacom.cmd --device lg-sousa --getkey
ares-device.cmd --system-info --device lg-sousa
```

Se o IP mudar, atualize o endereço com `ares-setup-device.cmd --modify lg-sousa -i "host=NOVO_IP"`.

### 5. Instale, abra e conecte sua lista

No PowerShell, execute os comandos abaixo. Use o nome exato do arquivo que você baixou.

```powershell
ares-install.cmd --device lg-sousa "$env:USERPROFILE\Downloads\com.sousatv.player_1.1.0_all.ipk"
ares-launch.cmd --device lg-sousa com.sousatv.player
```

O **Sousa TV** fica disponível no menu inicial da LG. No app, escolha **Xtream Codes** e informe endereço do servidor, usuário e senha, ou escolha **URL da lista M3U** e informe o link completo. Use as setas e **OK** para navegar e **Voltar** para retornar ao catálogo.

### Manutenção

- No app **Developer Mode**, use **Extend** antes de o contador da sessão zerar. Se o modo de desenvolvedor for desativado, o webOS remove os apps instalados por ele. Nesse caso, reative o modo e repita a autorização e a instalação.
- Se a conexão falhar, confira o IP, a rede local, o **Dev Mode Status** e o **Key Server**. Redes de convidados podem impedir a comunicação entre o PC e a TV.
- Se o catálogo falhar, confirme os dados de acesso e se o provedor permite requisições do webOS quando houver restrição de CORS. Se o catálogo carregar e um vídeo falhar, confira com o provedor se há uma versão HLS ou MP4 compatível com sua TV.
- Na TV, use **Configurações → Verificar atualização** para consultar a última versão publicada. A instalação do IPK usa o CLI oficial da LG no computador pareado.
- No Windows com o atalho **Atualizar Sousa TV**, abra o atalho com a TV ligada na mesma rede. Ele verifica a versão instalada, baixa e confere o SHA-256 do IPK publicado, instala a versão mais recente quando necessário e abre o app.
- Em outro PC, instale o IPK novo por cima com o comando `ares-install.cmd` da etapa 5. Com Node.js 20 ou superior, também é possível executar `node tools/atualizar-sousatv.cjs lg-sousa`. Se o pacote `@webos-tools/cli` foi instalado globalmente, defina `$env:SOUSA_WEBOS_CLI = Join-Path (npm.cmd root -g) '@webos-tools/cli'` antes de rodar o script.

[Developer Mode da LG](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app) · [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-installation) · [Protocolos de streaming](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)

## Dados e compilação

O aplicativo contata a fonte informada, os endereços de mídia e os servidores de imagens do catálogo. Favoritos e progresso são guardados localmente por fonte. A opção **Salvar dados de acesso nesta TV** é voluntária e grava os dados no armazenamento local do webOS, sem criptografia própria. Prefira HTTPS quando estiver disponível no seu provedor.

Para gerar o IPK com o CLI instalado:

```powershell
New-Item -ItemType Directory -Force dist
ares-package.cmd --no-minify app -o dist
```

A interface foi projetada para webOS 4.0 ou mais recente. A validação desta versão cobre o empacotamento oficial da LG e testes em navegador com um servidor de exemplo. A compatibilidade com cada modelo de TV e provedor precisa ser confirmada no aparelho.
