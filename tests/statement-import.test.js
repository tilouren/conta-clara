"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const parser = require("../statement-import.js");

test("interprets EUR amounts with European and US separators", () => {
  assert.equal(parser.parseAmount("1.234,56 €"), 1234.56);
  assert.equal(parser.parseAmount("-1,23"), -1.23);
  assert.equal(parser.parseAmount("(24.90)"), -24.9);
  assert.equal(parser.parseAmount("2,345.67"), 2345.67);
  assert.equal(parser.parseAmount("n/a"), null);
});

test("parses Portuguese transaction dates and rejects impossible calendar dates", () => {
  assert.equal(parser.parseDate("03/08/2026"), "2026-08-03");
  assert.equal(parser.parseDate("2026-08-03T11:20:00"), "2026-08-03");
  assert.equal(parser.parseDate("29 fev. 2024"), "2024-02-29");
  assert.equal(parser.parseDate("29/02/2025"), null);
});

test("parses semicolon-separated bank CSV with accented quoted descriptions", () => {
  const result = parser.parseCsv([
    "Data;Descri\u00e7\u00e3o;Montante;Tipo",
    "03/08/2026;\"Supermercado, compra do m\u00eas\";24,50;D\u00e9bito",
    "05/08/2026;\"Transfer\u00eancia recebida\";1.113,83;Cr\u00e9dito"
  ].join("\r\n"));
  assert.equal(result.format, "CSV");
  assert.equal(result.transactions.length, 2);
  assert.deepEqual(result.transactions.map(item => [item.date, item.amount, item.kind]), [
    ["2026-08-03", 24.5, "expense"],
    ["2026-08-05", 1113.83, "income"]
  ]);
  assert.equal(result.transactions[0].confidence, "high");
  assert.equal(result.transactions[1].category, "Outro rendimento");
});

test("decodes legacy Portuguese CSV encodings on the device", async () => {
  const csv = Buffer.from([
    0x44, 0x61, 0x74, 0x61, 0x3b, 0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f, 0x3b,
    0x4d, 0x6f, 0x6e, 0x74, 0x61, 0x6e, 0x74, 0x65, 0x0a,
    0x30, 0x33, 0x2f, 0x30, 0x38, 0x2f, 0x32, 0x30, 0x32, 0x36, 0x3b,
    0x53, 0x75, 0x70, 0x65, 0x72, 0x6d, 0x65, 0x72, 0x63, 0x61, 0x64, 0x6f, 0x3b, 0x32, 0x34, 0x2c, 0x35, 0x30
  ]);
  const file = {
    name: "extrato.csv",
    size: csv.byteLength,
    arrayBuffer: async () => csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength)
  };
  const result = await parser.parseStatementFile(file);
  assert.equal(result.transactions[0].description, "Supermercado");
  assert.equal(result.transactions[0].kind, "expense");
});

test("uses explicitly signed amounts and honours separate debit and credit columns", () => {
  const signed = parser.parseCsv([
    "date,description,amount",
    "2026-08-01,Salary,1250.00",
    "2026-08-02,Groceries,-47.90"
  ].join("\n"));
  assert.deepEqual(signed.transactions.map(item => item.kind), ["income", "expense"]);

  const separated = parser.parseCsv([
    "Data;Descrição;Débito;Crédito",
    "02/08/2026;Supermercado;38,00;",
    "04/08/2026;Reembolso;;12,50"
  ].join("\n"));
  assert.deepEqual(separated.transactions.map(item => [item.kind, item.amount]), [
    ["expense", 38],
    ["income", 12.5]
  ]);
});

test("treats unsigned CSV bank outflows conservatively and flags inferred directions", () => {
  const result = parser.parseCsv([
    "Data;Descrição;Montante",
    "03/08/2026;Supermercado;24,50",
    "05/08/2026;Salário;1.250,00"
  ].join("\n"));
  assert.deepEqual(result.transactions.map(item => [item.kind, item.amount, item.confidence]), [
    ["expense", 24.5, "low"],
    ["income", 1250, "low"]
  ]);
});

test("classifies bills, subscriptions, cash withdrawals and housing credit", () => {
  const result = parser.parseCsv([
    "Data;Descrição;Montante;Tipo",
    "02/10/2026;Fatura de eletricidade EDP;-60,00;Débito",
    "03/10/2026;Subscrição mensal Netflix;-11,99;Débito",
    "04/10/2026;Levantamento multibanco;-40,00;Débito",
    "05/10/2026;Supermercado;-25,30;Débito",
    "06/10/2026;Prestação crédito habitação;-753,87;Débito"
  ].join("\n"));
  assert.deepEqual(result.transactions.map(item => [item.category, item.kind]), [
    ["Contas da casa", "expense"],
    ["Subscrições", "expense"],
    ["Levantamentos", "expense"],
    ["Supermercado", "expense"],
    ["Crédito habitação", "credit"]
  ]);
});

test("reports malformed CSV headers and skips incomplete rows without losing valid ones", () => {
  assert.throws(() => parser.parseCsv("Account;Balance\nMain;100"), /colunas do CSV/);
  const result = parser.parseCsv([
    "date,description,amount",
    "2026-08-01,Supermercado,-12.00",
    "invalid,,",
    "2026-08-02,Salario,1500.00"
  ].join("\n"));
  assert.equal(result.transactions.length, 2);
  assert.equal(result.skipped, 1);
});

test("parses OFX/QFX entries and preserves signed direction", () => {
  const result = parser.parseOfx([
    "<OFX><BANKTRANLIST>",
    "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260803120000[-3:GMT]<TRNAMT>-42.90<NAME>Supermercado<MEMO>Compras</STMTTRN>",
    "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260805120000[-3:GMT]<TRNAMT>1200.00<NAME>Salario</STMTTRN>",
    "</BANKTRANLIST></OFX>"
  ].join(""));
  assert.deepEqual(result.transactions.map(item => [item.date, item.amount, item.kind]), [
    ["2026-08-03", 42.9, "expense"],
    ["2026-08-05", 1200, "income"]
  ]);
});

test("parses QIF movements without leaking account metadata", () => {
  const result = parser.parseQif([
    "!Type:Bank",
    "D03/08/2026\nT-12,50\nPSupermercado\nMCompras\n^",
    "D05/08/2026\nT+1250,00\nPSalario\n^"
  ].join("\n"));
  assert.deepEqual(result.transactions.map(item => [item.date, item.amount, item.kind]), [
    ["2026-08-03", 12.5, "expense"],
    ["2026-08-05", 1250, "income"]
  ]);
});

test("extracts PDF rows conservatively when bank statements include a date and balance columns", () => {
  const expense = parser.transactionFromPdfLine("03/08/2026 12/08/2026 SUPERMERCADO 27,50 1.234,56");
  const income = parser.transactionFromPdfLine("05/08/2026 TRANSFERENCIA RECEBIDA 1.113,83");
  assert.deepEqual([expense.date, expense.amount, expense.kind, expense.confidence], ["2026-08-03", 27.5, "expense", "low"]);
  assert.deepEqual([income.date, income.amount, income.kind], ["2026-08-05", 1113.83, "income"]);
});

test("does not accept unsupported formats or PDFs without local PDF.js", async () => {
  await assert.rejects(
    parser.parseStatementFile({ name: "statement.xlsx", size: 10, text: async () => "" }),
    /Formato não suportado/
  );
  await assert.rejects(
    parser.parseStatementFile({ name: "statement.pdf", size: 10, arrayBuffer: async () => new ArrayBuffer(10) }),
    /só está disponível na aplicação web local/
  );
});
