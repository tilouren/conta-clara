# Conta Clara

Aplicação web local para gerir movimentos bancários e acompanhar carteiras próprias de ETFs, cripto, ações e outros ativos. Começa vazia: não inclui transações, saldos ou identificadores do extrato usado como referência. A interface adapta-se a telemóvel e computador, com modo claro e escuro.

## Executar no Windows

É necessário ter o Node.js instalado; não é preciso instalar pacotes nem criar uma conta. No PowerShell, a partir desta pasta:

```powershell
node .\server.js
```

Por omissão, abre <http://127.0.0.1:8765> no computador. O servidor só aceita ligações locais e não expõe a aplicação à rede.

### Abrir no iPhone pela rede Wi-Fi

1. Liga o computador e o iPhone à mesma rede Wi-Fi privada.
2. No PowerShell, inicia o servidor a aceitar ligações da rede local:

   ```powershell
   $env:HOST = "0.0.0.0"
   node .\server.js
   ```

3. Se o Windows perguntar, permite o acesso ao Node.js **apenas em redes privadas**. Não cries uma regra para redes públicas.
4. O terminal mostra os endereços de rede detetados, por exemplo `http://192.168.1.25:8765`. No iPhone, abre esse endereço no Safari, substituindo-o pelo endereço apresentado no teu computador. Se não surgir nenhum endereço, executa `ipconfig` e procura o «Endereço IPv4» do adaptador Wi-Fi.
5. No Safari, toca em **Partilhar** e escolhe **Adicionar ao ecrã principal**. Se a opção não aparecer, desliza a lista de ações para cima e procura-a em «Editar ações».

Mantém o computador ligado e o servidor em execução enquanto usas a app. Se o endereço IP do computador mudar, volta a usar o endereço mostrado no terminal. Para regressar ao modo só local, termina o servidor com `Ctrl+C` e inicia-o normalmente com `node .\server.js`.

**Segurança e dados:** o acesso pela rede é HTTP, sem palavra-passe ou encriptação; usa-o apenas numa rede Wi-Fi privada e de confiança e nunca configures encaminhamento desta porta para a Internet. Os movimentos não são enviados ao computador servidor: ficam no armazenamento do navegador de cada dispositivo. Assim, o Safari do iPhone terá dados separados dos do computador; transfere-os manualmente com **Exportar cópia** e **Importar cópia**. As cotações continuam a exigir Internet.

### Utilização offline no iPhone

A aplicação inclui uma cache offline da interface e dos recursos, mas o Safari só permite instalá-la através de uma origem HTTPS segura. O endereço da rede local `http://192.168...` não permite registar o service worker; esta versão mostra essa limitação no rodapé. É necessário servir a aplicação num endereço HTTPS de confiança, abri-la no Safari com Internet, aguardar a preparação offline e adicioná-la ao ecrã principal. Depois da primeira preparação, a interface abre sem o computador ou Internet e os registos continuam no armazenamento local do iPhone. As cotações e a sincronização de uma versão nova requerem Internet; a atualização dos ficheiros também requer que o servidor que os fornece esteja acessível.

Os ficheiros PDF.js principais são incluídos na preparação offline. Recursos adicionais de PDF, como mapas de caracteres e fontes, ficam em cache à medida que são usados online; para importar PDFs sem ligação, abra primeiro um PDF no dispositivo com Internet.

### Publicar em HTTPS com GitHub Pages

O site contém apenas os ficheiros da aplicação, não os movimentos guardados pelo navegador. O repositório é público; não coloques nele extratos, cópias de segurança ou dados pessoais. Cada envio para `main` atualiza o site através de GitHub Actions e assinala a nova versão da PWA.

Para instalar no iPhone, abre `https://tilouren.github.io/conta-clara/` no Safari com ligação à Internet, aguarda que o rodapé confirme que a app está preparada para utilização sem ligação e usa **Partilhar → Adicionar ao ecrã principal**. A primeira visita e a atualização para novas versões precisam do site acessível; depois da cache inicial, a interface e os registos locais funcionam sem computador. Neste alojamento estático, a atualização online de cotações não está disponível; para cotações, usa a aplicação no servidor local.

### Atualizar a app depois de alterar ficheiros

O servidor envia as páginas e os recursos da app sem cache. Depois de alterares `index.html`, `app.js`, `styles.css`, o importador ou os recursos PDF, a app verifica a existência de uma versão nova ao abrir, quando voltares ao separador e, enquanto estiver visível, uma vez por minuto. Quando detetar alterações, escolhe **Atualizar agora**; confirma se houver um formulário ou revisão abertos. Os dados já guardados no navegador mantêm-se. Se alterares `server.js` ou outro código do servidor, primeiro termina o servidor com `Ctrl+C` e inicia-o novamente; depois recarrega a app. Não é necessário apagar o atalho do ecrã principal nem reinstalá-lo.

Para escolher outra porta, define-a antes de iniciar:

```powershell
$env:PORT = "8766"
node .\server.js
```

Para terminar o servidor, usa `Ctrl+C`.

## Funcionalidades

- Regista rendimentos — incluindo salário fixo ou variável —, despesas correntes, créditos e investimentos associados a movimentos bancários.
- Cria carteiras de investimento para ETFs, criptomoedas, ações e outros ativos. Regista unidades e custo médio, acompanha valor de mercado e pode atualizar cotações a pedido para ações/ETFs com símbolo suportado pelo Yahoo Finance e para BTC, ETH, BNB, XRP, SOL, DOGE, ADA, TRX, AVAX e LINK via CoinGecko. As cotações em moeda estrangeira são convertidas pela taxa de referência diária do Frankfurter. São valores indicativos, sujeitos a atraso e disponibilidade dos fornecedores; também é possível introduzir preços manualmente.
- Importa extratos em PDF pesquisável, CSV, OFX/QFX ou QIF. A análise e a classificação heurística ocorrem no browser. Antes de adicionar movimentos, mostra uma pré-visualização com data, descrição, montante, tipo e categoria editáveis; permite selecionar/desselecionar todos, avisa antes de selecionar possíveis duplicados e propaga uma categoria alterada a outras linhas com a mesma descrição e tipo. A gravação exige confirmação explícita.
- Permite cancelar a leitura e a revisão sem gravar dados. PDFs digitalizados como imagem não têm OCR; exporta o documento em CSV/OFX ou regista esses movimentos manualmente.
- Apresenta um dashboard mensal e divide as despesas em temas como casa e contas, supermercado e deslocações, saúde, subscrições, levantamentos e outros. O detalhe de despesas abre os movimentos do mês agrupados por tema e categoria, com acesso à edição de cada registo. Categorias como contas da casa, subscrições e levantamentos são sugeridas ao analisar extratos.
- Inclui uma análise opcional do histórico de seis meses, com comparação entre períodos, categorias variáveis a rever e cenários indicativos de poupança. Os cálculos são locais, usam apenas os movimentos registados e não constituem aconselhamento financeiro.
- Disponibiliza carteiras, pesquisa, formulários para edição e remoção e movimentos mensais recorrentes.
- Oferece tema claro/escuro com preferência guardada e exportação/importação de cópias JSON da aplicação. A importação substitui o conteúdo abrangido pela cópia; versões antigas continuam compatíveis.

## Privacidade e armazenamento

Movimentos, preferências e carteiras ficam no armazenamento local do navegador. Os PDFs e os outros extratos são lidos no navegador e nunca são enviados a uma instituição financeira ou serviço externo. Apenas quando escolhe **Atualizar cotações**, o servidor local consulta serviços públicos com os símbolos dos ativos; não envia nomes de carteiras, unidades, saldos ou movimentos. As cotações requerem ligação à Internet. O servidor não guarda esses dados em disco. Os dados pertencem ao navegador e ao endereço local utilizados; exporta cópias de segurança regularmente, porque limpar os dados do browser ou utilizar outro endereço/navegador pode tornar os dados anteriores inacessíveis. O ficheiro `vendor/PDFJS-LICENSE.txt` contém a licença de PDF.js, cuja distribuição é empacotada localmente.

## Usabilidade e heurísticas de Nielsen

Os principais fluxos aplicam as dez heurísticas:

1. **Visibilidade do estado do sistema:** mês selecionado, totais, progresso da leitura, resultado e notificações.
2. **Correspondência entre o sistema e o mundo real:** rótulos em português de Portugal, datas compreensíveis e valores em euros.
3. **Controlo e liberdade do utilizador:** cancelar análises e revisões; pesquisar, filtrar, editar e confirmar ações destrutivas.
4. **Consistência e normas:** termos, categorias, botões, ícones e comportamento reutilizados entre movimentos e carteiras.
5. **Prevenção de erros:** validação de campos, prevenção de gravações automáticas, possível deteção de duplicados e confirmações explícitas antes de importar extratos.
6. **Reconhecimento em vez de memorização:** sugestões de tipo/categoria e resumos apresentados junto dos movimentos a rever.
7. **Flexibilidade e eficiência de utilização:** navegação rápida, pesquisa, filtros mensais, análise do histórico, edição e preferências de tema.
8. **Design estético e minimalista:** dashboard resumido e arranque sem dados de demonstração.
9. **Ajuda no reconhecimento, diagnóstico e recuperação de erros:** mensagens explicativas e cópias de segurança exportáveis/importáveis.
10. **Ajuda e documentação:** formatos de extrato, privacidade e limites do leitor de PDFs explicados na aplicação e neste guia.

## Testes

Executa os testes de extratos e de cotações com:

```powershell
node --test .\tests\*.test.js
```
