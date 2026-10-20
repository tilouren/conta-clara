((root, factory) => {
  const parser = factory();
  if (typeof module === "object" && module.exports) module.exports = parser;
  root.ContaClaraStatementParser = parser;
})(typeof globalThis === "object" ? globalThis : window, () => {
  "use strict";

  const TEXT_LIMIT = 15 * 1024 * 1024;
  const TRANSACTION_LIMIT = 2000;
  const DATE_PATTERN = "(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{1,2}\\s+[A-Za-zÀ-ÿ.]+\\s+\\d{4})";
  const AMOUNT_PATTERN = /(?:\(\s*[-−]?\s*\d[\d .]*[,.]\d{1,2}\s*\)|[-−+]?\s*\d{1,3}(?:[. ]\d{3})+(?:,\d{1,2}|[.]\d{1,2})|[-−+]?\s*\d+(?:[,.]\d{1,2}))(?:\s*€)?/g;
  const CATEGORY_RULES = [
    [/sal[aá]rio|ordenado|vencimento|payroll|salary|remunera[çc][ãa]o/i, "Salário variável"],
    [/pens[aã]o|subs[ií]dio|presta[çc][ãa]o social|social benefit/i, "Prestação social"],
    [/reembols|devolu[çc][ãa]o|estorno|refund|cashback/i, "Reembolso"],
    [/\betfs?\b|cripto|crypto|bitcoin|ethereum|\ba[çc][õo]es\b|\bstocks?\b|corretora|trading|compra.{0,20}t[ií]tul/i, "Fundos"],
    [/levantamentos?|levantamento multibanco|cash withdrawal|withdrawals?|saque|atm\b/i, "Levantamentos"],
    [/(?:conta|fatura|factura).{0,24}(?:luz|energia|eletricidade|electricity|[áa]gua|g[áa]s)|(?:energia|eletricidade|electricity|[áa]gua|water|g[áa]s|utility|utilities|edp|endesa|iberdrola|galp energia|saneamento)/i, "Contas da casa"],
    [/via verde|transport|cp(?:\s|$)|metro|combust[ií]vel|gasolina|gas[oó]leo|repsol|galp|uber|bolt/i, "Transportes"],
    [/supermerc|mercearia|hipermerc|continente|pingo doce|lidl|aldi|auchan|mercado|minipre[cç]o/i, "Supermercado"],
    [/restaurant|cafe|caf[eé]|glovo|uber eats|bolt food|takeaway|refei[çc][õo]es/i, "Refeições e entregas"],
    [/multicare|farm[aá]cia|hospital|sa[uú]de|m[eé]dic|cl[ií]nica|health/i, "Saúde"],
    [/segur|insurance|multicare/i, "Seguros"],
    [/telecom|internet|telefone|telem[oó]vel|vodafone|meo|nos\b|nowo/i, "Telecomunicações"],
    [/subscri[cç][aã]o|assinatura|subscription|membership|netflix|spotify|disney|prime video|icloud/i, "Subscrições"],
    [/digital|app store|google play/i, "Serviços digitais"],
    [/servi[cç]os dom[eé]sticos|limpeza|lavandaria|household service/i, "Serviços domésticos"],
    [/educa[çc][aã]o|school|universidade|curso|tuition/i, "Educação"],
    [/lazer|cinema|teatro|concerto|leisure/i, "Lazer"],
    [/comiss[aã]o|comission|manuten[çc][ãa]o de conta/i, "Comissões bancárias"],
    [/presta[çc][ãa]o|cr[eé]dito hab|cr[eé]dito pessoal|empr[eé]stimo|loan instalment|credit payment/i, "Crédito"],
    [/renda|arrendamento|habita[çc][ãa]o|condom[ií]nio|mortgage/i, "Habitação"],
  ];
  let pdfjsLoadPromise = null;

  function normalize(value) {
    return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").trim();
  }

  function formatDate(year, month, day) {
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function parseDate(value) {
    const text = String(value || "").trim();
    let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
    if (match) return formatDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(text);
    if (match) {
      let year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      return formatDate(year, Number(match[2]), Number(match[1]));
    }
    match = /^(\d{1,2})\s+([\p{L}.]+)\s+(\d{4})$/iu.exec(text);
    if (!match) return null;
    const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const monthText = normalize(match[2]).replace(/\.$/, "");
    const month = monthNames.findIndex(name => monthText.startsWith(name)) + 1;
    return month ? formatDate(Number(match[3]), month, Number(match[1])) : null;
  }

  function parseAmount(value) {
    let text = String(value || "").trim().replace(/[€$£\s\u00a0]/g, "");
    if (!text) return null;
    const isParenthesized = /^\(.*\)$/.test(text);
    if (isParenthesized) text = text.slice(1, -1);
    text = text.replace(/[−–]/g, "-");
    if (!/^[+-]?\d[\d.,]*$/.test(text)) return null;
    const sign = text.startsWith("-") || isParenthesized ? -1 : 1;
    text = text.replace(/^[+-]/, "");
    const decimalSeparator = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
    let normalized;
    if (decimalSeparator < 0) {
      normalized = text.replace(/[.,]/g, "");
    } else {
      const decimalDigits = text.length - decimalSeparator - 1;
      if (decimalDigits > 2 || decimalDigits < 1) return null;
      normalized = `${text.slice(0, decimalSeparator).replace(/[.,]/g, "")}.${text.slice(decimalSeparator + 1)}`;
    }
    const amount = Number(normalized) * sign;
    return Number.isFinite(amount) && Math.abs(amount) <= 999999999 ? Math.round(amount * 100) / 100 : null;
  }

  function categorize(description, signedAmount) {
    const clean = String(description || "").trim() || "Movimento importado";
    let matchedCategory = null;
    for (const [pattern, category] of CATEGORY_RULES) {
      if (pattern.test(clean)) {
        matchedCategory = category;
        break;
      }
    }
    const normalized = normalize(clean);
    const isLoan = signedAmount < 0 && matchedCategory === "Crédito";
    const isInvestment = /\betfs?\b|cripto|crypto|bitcoin|ethereum|\bacoes\b|\bstocks?\b|\btrading\b|corretora/.test(normalized);
    const isRefund = matchedCategory === "Reembolso";
    const incomingDescription = /salario|ordenado|vencimento|payroll|salary|remuneracao|transferencia recebida|transferencia a favor|reembolso|devolucao|estorno|refund|cashback|dividendo|dividend|juros creditados|deposito a favor/.test(normalized);
    const kind = isLoan ? "credit"
      : isInvestment ? "investment"
        : signedAmount > 0 ? "income" : "expense";
    const category = isLoan ? (/habita|mortgage/.test(normalized) ? "Crédito habitação"
      : /autom[oó]vel|automobile|carro/.test(normalized) ? "Crédito automóvel"
        : /cart[aã]o/.test(normalized) ? "Cartão de crédito" : "Crédito pessoal")
      : isInvestment ? (/cripto|crypto|bitcoin|ethereum/.test(normalized) ? "Cripto"
        : /\betfs?\b/.test(normalized) ? "ETF" : /a[çc][õo]es|stocks?/.test(clean) ? "Ações" : "Fundos")
        : kind === "income" ? (isRefund ? "Reembolso" : matchedCategory === "Salário variável" ? "Salário variável" : matchedCategory === "Prestação social" ? "Prestação social" : "Outro rendimento")
          : matchedCategory || "Outras despesas";
    const hasSpecificMatch = matchedCategory !== null;
    const confidence = (kind === "income" && !incomingDescription && !isRefund) || (!hasSpecificMatch && kind !== "income") ? "low" : "high";
    return {
      description: clean.slice(0, 120),
      kind,
      category,
      nature: kind === "expense" || kind === "credit" ? "variable" : null,
      recurring: false,
      confidence
    };
  }

  function makeTransaction(description, date, amount, options = {}) {
    if (!date || amount === null || amount === 0) return null;
    const clean = String(description || "").replace(/\s+/g, " ").trim();
    if (!clean) return null;
    const normalized = normalize(clean);
    const incomingHint = /salario|ordenado|vencimento|payroll|salary|remuneracao|pensao|subsidio|prestacao social|social benefit|transferencia recebida|transferencia a favor|reembolso|devolucao|estorno|refund|cashback|dividendo|dividend|juros creditados|deposito a favor/.test(normalized);
    const directionIsExplicit = options.directionIsExplicit !== false;
    const resolvedAmount = amount > 0 && !directionIsExplicit && !incomingHint ? -amount : amount;
    const classification = categorize(clean, resolvedAmount);
    return {
      id: `extract-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`,
      description: classification.description,
      date,
      amount: Math.abs(Math.round(resolvedAmount * 100) / 100),
      kind: classification.kind,
      category: classification.category,
      nature: classification.nature,
      recurring: classification.recurring,
      confidence: !directionIsExplicit && classification.kind !== "investment" ? "low" : classification.confidence,
      selected: true,
      duplicate: false
    };
  }

  function requireTransactions(rows, format, skipped = 0) {
    const transactions = rows.filter(Boolean);
    if (transactions.length === 0) {
      throw new Error("Não foram encontrados movimentos reconhecíveis. Confirme que o ficheiro inclui datas e montantes; um PDF digitalizado como imagem não permite extração automática.");
    }
    if (transactions.length > TRANSACTION_LIMIT) {
      throw new Error(`Foram encontrados mais de ${TRANSACTION_LIMIT} movimentos. Exporte um período mais curto e volte a importar.`);
    }
    return { format, transactions, skipped };
  }

  function parseCsvRows(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"' && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          cell += character;
        }
      } else if (character === '"' && cell.length === 0) {
        quoted = true;
      } else if (character === delimiter) {
        row.push(cell);
        cell = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell);
        if (row.some(value => value.trim() !== "")) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    if (quoted) throw new Error("O CSV contém um campo entre aspas sem fecho.");
    row.push(cell);
    if (row.some(value => value.trim() !== "")) rows.push(row);
    return rows;
  }

  function csvDelimiter(headerLine) {
    const candidates = [",", ";", "\t"];
    let best = ",";
    let bestCount = 0;
    for (const delimiter of candidates) {
      let quoted = false;
      let count = 0;
      for (let index = 0; index < headerLine.length; index += 1) {
        const character = headerLine[index];
        if (character === '"') {
          if (quoted && headerLine[index + 1] === '"') index += 1;
          else quoted = !quoted;
        } else if (character === delimiter && !quoted) {
          count += 1;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        best = delimiter;
      }
    }
    return best;
  }

  function findHeaderIndex(headers, pattern, excluded = null) {
    return headers.findIndex(header => pattern.test(header) && (!excluded || !excluded.test(header)));
  }

  function parseCsv(text) {
    const contents = text.replace(/^\uFEFF/, "");
    const firstLine = contents.split(/\r?\n/, 1)[0] || "";
    const rows = parseCsvRows(contents, csvDelimiter(firstLine));
    if (rows.length < 2) throw new Error("O CSV precisa de uma linha de cabeçalhos e pelo menos um movimento.");
    const headers = rows[0].map(normalize);
    const dateIndex = findHeaderIndex(headers, /(^| )(data|date|dtposted|postingdate|posteddate|valuedate|movementdate)( |$)/);
    const descriptionIndex = findHeaderIndex(headers, /descricao|description|payee|memo|name|beneficiario|estabelecimento|merchant|historic|movimento|transacao|detalhe|conceito/);
    const amountIndex = findHeaderIndex(headers, /(^| )(amount|montante|valor|trnamt|quantia|importe)( |$)/i, /saldo|balance|cambio|exchange/);
    const debitIndex = findHeaderIndex(headers, /debito|debit|saida|withdrawal|levantamento/);
    const creditIndex = findHeaderIndex(headers, /credito|credit|entrada|deposit/);
    const typeIndex = findHeaderIndex(headers, /^(tipo|type|direction|natureza)$/);
    if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
      throw new Error("Não foram reconhecidas as colunas do CSV. Precisa de ter data, descrição e montante ou colunas de débito/crédito.");
    }

    let skipped = 0;
    const transactions = [];
    for (const cells of rows.slice(1)) {
      const date = parseDate(cells[dateIndex]);
      let amount = amountIndex < 0 ? null : parseAmount(cells[amountIndex]);
      let directionIsExplicit = amount !== null && /^[+-]/.test(String(cells[amountIndex]).trim());
      if (debitIndex >= 0 || creditIndex >= 0) {
        const debit = debitIndex >= 0 ? parseAmount(cells[debitIndex]) : null;
        const credit = creditIndex >= 0 ? parseAmount(cells[creditIndex]) : null;
        if (debit !== null && debit !== 0) {
          amount = -Math.abs(debit);
          directionIsExplicit = true;
        } else if (credit !== null && credit !== 0) {
          amount = Math.abs(credit);
          directionIsExplicit = true;
        }
      }
      const description = cells[descriptionIndex] || "";
      if (typeIndex >= 0 && !directionIsExplicit && amount !== null) {
        const type = normalize(cells[typeIndex] || "");
        if (/debito|saida|pagamento|compra|levantamento|debit/.test(type)) {
          amount = -Math.abs(amount);
          directionIsExplicit = true;
        } else if (/credito|entrada|deposito|salario|credit/.test(type)) {
          amount = Math.abs(amount);
          directionIsExplicit = true;
        }
      }
      if (!date || amount === null || amount === 0 || !String(description).trim()) {
        skipped += 1;
        continue;
      }
      const transaction = makeTransaction(description, date, amount, { directionIsExplicit });
      if (transaction) transactions.push(transaction);
      else skipped += 1;
      if (transactions.length > TRANSACTION_LIMIT) break;
    }
    return requireTransactions(transactions, "CSV", skipped);
  }

  function getField(block, field) {
    const match = new RegExp(`<${field}>([^<\\r\\n]*)`, "i").exec(block);
    return match ? match[1].trim() : "";
  }

  function parseOfxDate(value) {
    const match = /^(\d{4})(\d{2})(\d{2})/.exec(value);
    return match ? formatDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
  }

  function parseOfx(text) {
    const blocks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST\s*>|$)/gi)];
    if (blocks.length === 0) throw new Error("O OFX/QFX não contém movimentos bancários reconhecidos.");
    let skipped = 0;
    const transactions = [];
    for (const match of blocks.slice(0, TRANSACTION_LIMIT + 1)) {
      const block = match[1];
      const date = parseOfxDate(getField(block, "DTPOSTED"));
      const amount = parseAmount(getField(block, "TRNAMT"));
      const description = [getField(block, "NAME"), getField(block, "MEMO")].filter(Boolean).join(" · ");
      if (!date || amount === null || amount === 0 || !description) {
        skipped += 1;
        continue;
      }
      const transaction = makeTransaction(description, date, amount);
      if (transaction) transactions.push(transaction);
    }
    return requireTransactions(transactions, "OFX/QFX", skipped);
  }

  function parseQifDate(value) {
    const match = /^(\d{1,2})[./-](\d{1,2})'[']?(\d{2}|\d{4})$/.exec(value)
      || /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(value);
    if (!match) return parseDate(value);
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return formatDate(year, Number(match[2]), Number(match[1]));
  }

  function parseQif(text) {
    const contents = text.replace(/^\uFEFF/, "").replace(/^!Type:[^\r\n]*(?:\r?\n)?/i, "");
    const blocks = contents.split("^").filter(block => block.trim());
    if (blocks.length === 0) throw new Error("O QIF não contém movimentos reconhecidos.");
    let skipped = 0;
    const transactions = [];
    for (const block of blocks.slice(0, TRANSACTION_LIMIT + 1)) {
      const date = parseQifDate(/^D(.+)$/im.exec(block)?.[1]?.trim() || "");
      const amount = parseAmount(/^T([^\r\n]*)/im.exec(block)?.[1] || "");
      const payee = /^P([^\r\n]*)/im.exec(block)?.[1]?.trim() || "";
      const memo = /^M([^\r\n]*)/im.exec(block)?.[1]?.trim() || "";
      const description = [payee, memo].filter(Boolean).join(" · ");
      if (!date || amount === null || amount === 0 || !description) {
        skipped += 1;
        continue;
      }
      const transaction = makeTransaction(description, date, amount);
      if (transaction) transactions.push(transaction);
    }
    return requireTransactions(transactions, "QIF", skipped);
  }

  function pdfItemLines(items) {
    const buckets = new Map();
    const lines = [];
    for (const item of items) {
      if (!item.str || !item.str.trim()) continue;
      const x = Number(item.transform && item.transform[4]) || 0;
      const y = Number(item.transform && item.transform[5]) || 0;
      const bucket = Math.round(y / 3);
      let line = null;
      for (let offset = -1; offset <= 1; offset += 1) {
        const candidates = buckets.get(bucket + offset) || [];
        line = candidates.find(candidate => Math.abs(candidate.y - y) <= 2.5) || line;
      }
      if (!line) {
        line = { y, items: [] };
        lines.push(line);
        const candidates = buckets.get(bucket) || [];
        candidates.push(line);
        buckets.set(bucket, candidates);
      }
      line.items.push({ x, text: item.str.trim() });
    }
    return lines
      .sort((a, b) => b.y - a.y)
      .map(line => {
        line.items.sort((a, b) => a.x - b.x);
        return line.items.map(item => item.text).join(" ").replace(/\s+/g, " ").trim();
      });
  }

  function parsePdfAmount(value) {
    let text = value.replace(/[€\s\u00a0]/g, "").replace(/[−–]/g, "-");
    const negative = /-/.test(text) || /^\(.*\)$/.test(text) || /\bdebit\b|\bdebito\b/i.test(text);
    text = text.replace(/[()]/g, "").replace(/-/g, "");
    const amount = parseAmount(text);
    return amount === null ? null : negative ? -Math.abs(amount) : Math.abs(amount);
  }

  function transactionFromPdfLine(line) {
    const dateMatch = new RegExp(`(?<!\\\\d)(${DATE_PATTERN})(?!\\\\d)`, "iu").exec(line);
    if (!dateMatch) return null;
    const date = parseDate(dateMatch[1].replace(/\s+/g, " "));
    if (!date) return null;
    const afterDate = line.slice(dateMatch.index + dateMatch[0].length);
    const beforeDate = line.slice(0, dateMatch.index);
    const rest = `${afterDate} ${beforeDate}`.trim().replace(new RegExp(DATE_PATTERN, "giu"), " ");
    const amountMatches = [...rest.matchAll(AMOUNT_PATTERN)];
    if (amountMatches.length === 0) return null;

    const isDebit = /\b(?:debito|debit|sa[ií]da|pagamento)\b/i.test(rest);
    const isCredit = /\b(?:credito|credit|entrada|recebid[oa])\b/i.test(rest);
    const amountMatch = isDebit || isCredit
      ? amountMatches.find(match => /[€]/.test(match[0])) || amountMatches[0]
      : amountMatches.length > 1 ? amountMatches[amountMatches.length - 2] : amountMatches[amountMatches.length - 1];
    const amount = parsePdfAmount(amountMatch[0]);
    if (amount === null || amount === 0) return null;
    let description = rest.replace(amountMatch[0], " ");
    description = description.replace(AMOUNT_PATTERN, " ").replace(/\s+/g, " ").trim();
    if (!description || normalize(description).split(" ").every(word => /^\d+$/.test(word))) return null;
    const directionIsExplicit = /[-−]/.test(amountMatch[0]) || isDebit || isCredit || /\b[d]\b|\b[c]\b/i.test(rest);
    const transaction = makeTransaction(description, date, amount, { directionIsExplicit });
    if (transaction && !directionIsExplicit && transaction.kind === "expense") transaction.confidence = "low";
    return transaction;
  }

  async function loadPdfLibrary(pdfjsLibrary) {
    if (pdfjsLibrary && typeof pdfjsLibrary.getDocument === "function") return pdfjsLibrary;
    if (typeof document === "undefined") {
      throw new Error("O leitor de PDF só está disponível na aplicação web local.");
    }
    const libraryUrl = new URL("vendor/pdf.mjs", document.baseURI);
    if (libraryUrl.protocol !== "http:" && libraryUrl.protocol !== "https:") {
      throw new Error("Para ler PDFs, inicie o servidor local com `node .\\server.js`. O ficheiro nunca é enviado para a Internet.");
    }
    if (!pdfjsLoadPromise) {
      pdfjsLoadPromise = import(libraryUrl.href).catch(error => {
        pdfjsLoadPromise = null;
        throw new Error(`Não foi possível carregar o leitor de PDF local: ${error.message}`);
      });
    }
    return pdfjsLoadPromise;
  }

  async function parsePdf(file, pdfjsLibrary, signal, onProgress) {
    pdfjsLibrary = await loadPdfLibrary(pdfjsLibrary);
    if (signal && signal.aborted) throw new Error("Análise cancelada.");
    const fileData = new Uint8Array(await file.arrayBuffer());
    if (signal && signal.aborted) throw new Error("Análise cancelada.");
    pdfjsLibrary.GlobalWorkerOptions.workerSrc = new URL("vendor/pdf.worker.mjs", document.baseURI).href;
    const loadingTask = pdfjsLibrary.getDocument({
      data: fileData,
      useSystemFonts: true,
      isEvalSupported: false,
      cMapUrl: new URL("vendor/cmaps/", document.baseURI).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("vendor/standard_fonts/", document.baseURI).href,
      wasmUrl: new URL("vendor/wasm/", document.baseURI).href
    });
    const abort = () => { void loadingTask.destroy(); };
    if (signal) signal.addEventListener("abort", abort, { once: true });
    let pdf;
    try {
      pdf = await loadingTask.promise;
      if (signal && signal.aborted) throw new Error("Análise cancelada.");
      if (pdf.numPages > 200) throw new Error("O PDF excede o limite de 200 páginas. Exporte um período mais curto.");
      const lines = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (signal && signal.aborted) throw new Error("Análise cancelada.");
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        lines.push(...pdfItemLines(content.items));
        if (onProgress) onProgress(pageNumber, pdf.numPages);
      }
      let skipped = 0;
      const transactions = [];
      for (const line of lines) {
        if (transactions.length > TRANSACTION_LIMIT) break;
        const transaction = transactionFromPdfLine(line);
        if (transaction) transactions.push(transaction);
        else if (new RegExp(DATE_PATTERN, "iu").test(line)) skipped += 1;
      }
      return requireTransactions(transactions, "PDF", skipped);
    } catch (error) {
      if (signal && signal.aborted) throw new Error("Análise cancelada.");
      throw error;
    } finally {
      if (signal) signal.removeEventListener("abort", abort);
      await loadingTask.destroy();
    }
  }

  async function parseStatementFile(file, pdfjsLibrary = null, options = {}) {
    if (!file || typeof file.name !== "string") throw new Error("Selecione um ficheiro de extrato válido.");
    if (file.size > TEXT_LIMIT) throw new Error("O extrato excede o limite de 15 MB. Selecione um ficheiro mais pequeno.");
    const extension = file.name.split(".").pop().toLocaleLowerCase("pt-PT");
    if (!["pdf", "csv", "ofx", "qfx", "qif"].includes(extension)) {
      throw new Error("Formato não suportado. Escolha um PDF pesquisável, CSV, OFX/QFX ou QIF.");
    }
    if (extension === "pdf") return parsePdf(file, pdfjsLibrary, options.signal, options.onProgress);
    const bytes = await file.arrayBuffer();
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
    if (options.signal && options.signal.aborted) throw new Error("Análise cancelada.");
    if (extension === "csv") return parseCsv(text);
    if (extension === "ofx" || extension === "qfx") return parseOfx(text);
    if (extension === "qif") return parseQif(text);
    return parseOfx(text);
  }

  return {
    normalize,
    parseAmount,
    parseCsv,
    parseDate,
    parseOfx,
    parsePdfAmount,
    parseQif,
    parseStatementFile,
    transactionFromPdfLine
  };
});
