"use strict";

const http = require("node:http");
const fs = require("node:fs");
const crypto = require("node:crypto");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { STOCK_SYMBOL_PATTERN, fetchMarketQuotes } = require("./market-quotes.js");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 8765;
if (!net.isIP(HOST)) {
  console.error("A variável HOST tem de conter um endereço IP válido, por exemplo 127.0.0.1 ou 0.0.0.0.");
  process.exit(1);
}

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const VERSIONED_FILES = ["index.html", "app.js", "styles.css", "statement-import.js", "market-quotes.js", "service-worker.js", "manifest.webmanifest", "icon.svg"];

function addDirectoryMetadata(hash, directory, relativeDirectory = "vendor") {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    const relativeFilename = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      addDirectoryMetadata(hash, filename, relativeFilename);
    } else if (entry.isFile()) {
      const stats = fs.statSync(filename);
      hash.update(`${relativeFilename}:${stats.size}:${stats.mtimeMs};`);
    }
  }
}

function getAppVersion() {
  const hash = crypto.createHash("sha256");
  for (const filename of VERSIONED_FILES) {
    const fullPath = path.join(ROOT, filename);
    const stats = fs.statSync(fullPath);
    hash.update(`${filename}:${stats.size}:${stats.mtimeMs};`);
    hash.update(fs.readFileSync(fullPath));
  }
  addDirectoryMetadata(hash, path.join(ROOT, "vendor"));
  return hash.digest("hex").slice(0, 16);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(body),
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function parseSymbolList(params, key, pattern, maximum) {
  const rawValues = params.getAll(key);
  if (rawValues.length > 1) throw new Error(`Use apenas um parâmetro ${key}.`);
  if (rawValues.length === 0 || rawValues[0] === "") return [];
  const symbols = rawValues[0].split(",").map(symbol => symbol.trim().toUpperCase());
  if (symbols.length > maximum || symbols.some(symbol => !pattern.test(symbol))) {
    throw new Error(`A lista de ${key} contém símbolos inválidos ou excede o limite de ${maximum}.`);
  }
  return [...new Set(symbols)];
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  let requestUrl;
  try {
    requestUrl = new URL(request.url, "http://localhost");
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    response.writeHead(400);
    response.end("Invalid URL");
    return;
  }

  if (pathname === "/api/quotes") {
    try {
      const params = requestUrl.searchParams;
      const stocks = parseSymbolList(params, "stocks", STOCK_SYMBOL_PATTERN, 20);
      const cryptos = parseSymbolList(params, "crypto", /^[A-Z0-9]{2,10}$/, 10);
      if (stocks.length === 0 && cryptos.length === 0) throw new Error("Indique pelo menos um símbolo suportado.");
      sendJson(response, 200, await fetchMarketQuotes({ stocks, cryptos }));
    } catch (error) {
      sendJson(response, 400, { error: error.message || "Não foi possível consultar as cotações." });
    }
    return;
  }

  if (pathname === "/api/version") {
    try {
      sendJson(response, 200, { version: getAppVersion() });
    } catch (error) {
      console.error(`Não foi possível calcular a versão da aplicação: ${error.message}`);
      sendJson(response, 500, { error: "Não foi possível verificar a versão da aplicação." });
    }
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filename = path.resolve(ROOT, `.${pathname}`);
  if (!filename.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filename, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Unable to read local application");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Length": contents.length,
      "Content-Type": CONTENT_TYPES[path.extname(filename)] || "application/octet-stream",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Expires": "0",
      "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  });
});

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} já está a ser utilizada. Defina a variável PORT para escolher outra porta.`);
  } else {
    console.error(`Não foi possível iniciar o servidor local: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  if (HOST === "0.0.0.0" || HOST === "::") {
    console.log(`Aplicação Conta Clara disponível neste computador: http://127.0.0.1:${PORT}`);
    const addresses = Object.values(os.networkInterfaces()).flatMap(interfaces => interfaces || [])
      .filter(address => address.family === "IPv4" && !address.internal)
      .map(address => `http://${address.address}:${PORT}`);
    if (addresses.length) {
      console.log("Para abrir noutro dispositivo ligado à mesma rede Wi-Fi:");
      for (const address of addresses) console.log(`  ${address}`);
    } else {
      console.log("Não foi detetado um endereço IPv4 de rede. Verifique a ligação Wi-Fi do computador.");
    }
    console.warn("Acesso na rede local ativado. Use apenas numa rede Wi-Fi privada e de confiança; não exponha esta porta à Internet.");
  } else {
    const displayHost = HOST.includes(":") ? `[${HOST}]` : HOST;
    console.log(`Aplicação Conta Clara disponível apenas neste computador: http://${displayHost}:${PORT}`);
  }
  console.log("Os movimentos e posições permanecem locais. A API de cotações só envia símbolos a fornecedores públicos quando solicitada.");
});
