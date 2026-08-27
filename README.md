# Flipbook Grabber

Salve publicações do AnyFlip como PDF ou EPUB, em um clique, sem perder qualidade.

Flipbooks são ótimos para ler no navegador e péssimos para guardar. Não tem botão de download, não dá pra abrir offline, não entra no Kindle e some no dia em que a conta que hospedou o arquivo for encerrada. O Flipbook Grabber resolve isso: abre a publicação, encontra todas as páginas sozinho e monta um arquivo que é seu.

![Licença: Unlicense](https://img.shields.io/badge/licen%C3%A7a-Unlicense-brightgreen)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4)

## O que ele faz

**Imagem original, não captura de tela.** A extensão lê a lista real de páginas da publicação e baixa cada imagem no tamanho em que foi enviada. Nada de fotografar a tela e ficar com o resultado limitado à sua resolução.

**PDF ou EPUB, você escolhe.** O PDF sai com uma página por folha, no tamanho exato da imagem, e abre em qualquer lugar. O EPUB embarca as imagens originais sem reconversão, pronto pro seu leitor de e-book.

**Livro inteiro de uma vez.** Uma publicação de 130 páginas é descoberta em uma leitura só. Você não precisa folhear página por página esperando carregar.

**Não trava o navegador.** O download roda em segundo plano. Feche o painel, troque de aba, continue trabalhando. O trabalho segue e o arquivo aparece nos seus downloads quando terminar.

**Você enxerga o progresso.** As miniaturas vão acendendo conforme cada página chega, com contador e barra. Dá pra cancelar a qualquer momento, e o botão está sempre à mão.

## Instalação

Ainda não está na Chrome Web Store. Por enquanto é instalação local, que leva menos de um minuto:

```bash
git clone https://github.com/Viniciusadm/flipbook-grabber.git
cd flipbook-grabber
npm install
npm run build
```

Depois, no navegador:

1. Abra `chrome://extensions`
2. Ligue o **Modo do desenvolvedor** no canto superior direito
3. Clique em **Carregar sem compactação** e selecione a pasta `dist`

Funciona no Chrome e no Edge.

## Como usar

Abra a publicação no AnyFlip, espere carregar e clique no ícone da extensão. O painel lateral abre já procurando as páginas. Escolha PDF ou EPUB, clique em **Baixar publicação** e pronto.

Com um download em andamento, é só abrir outra publicação: o painel detecta a nova página sozinho e o botão vira **Adicionar à fila**. Os downloads rodam um por vez, e cada um aparece na lista com seu próprio progresso, podendo ser cancelado sem afetar os demais.

## Por baixo do capô

Baixar um flipbook parece simples até você tentar. Três detalhes atrapalham:

A página que você abre não é o leitor. O `anyflip.com` serve uma vitrine, e o leitor de verdade vive dentro de um iframe de outra origem, isolado por segurança do navegador.

Os arquivos não seguem numeração. As páginas são nomeadas por hash, então não existe sequência do tipo `1.jpg`, `2.jpg` pra adivinhar.

A lista de páginas chega embaralhada. O índice do livro vem codificado e só é aberto em tempo de execução pelo próprio leitor, o que inutiliza qualquer tentativa de baixar e interpretar o arquivo de configuração por fora.

A saída é pedir a informação a quem já a tem. A extensão executa um leitor dentro do contexto do player, no frame certo, e recupera o índice já decodificado junto com o caminho base das imagens. Uma leitura devolve o livro inteiro.

O restante é engenharia direta: uma fila de download com concorrência limitada e repetição automática em caso de falha de rede, e dois montadores de arquivo. O PDF é escrito por um gerador próprio que embute cada página como JPEG, sem depender de bibliotecas pesadas. O EPUB é empacotado seguindo o padrão EPUB 3.

## Qualidade

O gerador de PDF foi validado contra o poppler, que é o motor por trás de boa parte dos leitores de PDF do Linux: arquivo aberto, contagem de páginas conferida e todas as páginas renderizadas. O EPUB passa por verificação de estrutura, com o `mimetype` na posição exigida pela especificação e XML válido em todas as entradas.

A suíte cobre a montagem das URLs, o comportamento da fila de download sob falha e cancelamento, e a estrutura dos dois formatos.

```bash
npm test
npm run typecheck
```

## Estrutura

```
src/
  adapters/anyflip.ts     Descoberta das páginas
  background/
    service-worker.ts     Estado do trabalho
    downloader.ts         Fila com concorrência e repetição
  builders/
    images.ts             Conversão de imagem
    pdf.ts                Gerador de PDF
    epub.ts               Empacotador EPUB 3
  offscreen/worker.ts     Baixa, converte e entrega
  sidepanel/              Interface
```

Suportar outro site de flipbook é implementar a interface `FlipbookAdapter` e registrá-lo. O resto do caminho não muda.

## Licença

Unlicense. O código está em domínio público. Use, modifique, venda, embuta em produto fechado, republique com outro nome. Não precisa pedir, não precisa creditar, não precisa avisar.

## Uso responsável

A ferramenta não distingue o que você tem direito de guardar do que não tem. Essa parte é com você. Use para arquivar material próprio, documentos públicos, catálogos e publicações que você tenha permissão de salvar. Respeite os direitos de quem publicou.
