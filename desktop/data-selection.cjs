/**
 * Seleção persistente e determinística do diretório de dados do ContentFlow.
 *
 * Objetivo: preservar a seleção do diretório de dados entre atualizações e
 * aberturas pelo Finder, sem nunca adivinhar diante de falha.
 *
 * Precedência:
 * 1. Configuração explícita via ambiente (CONTENTFLOW_DESKTOP_DATA_DIR e/ou
 *    CONTENTFLOW_ELECTRON_USER_DATA_DIR; esta última sozinha deriva
 *    `<userData>/data` como diretório de dados).
 * 2. Configuração persistente em `data-location.json` (válida e verificada).
 * 3. Auto-detecção de banco único existente.
 * 4. Instalação nova (SOMENTE quando não há config alguma e nenhum banco).
 *
 * Falhas que BLOQUEIAM a inicialização (nunca viram "instalação nova"):
 * - CONTENTFLOW_CONFIG_INVALID: data-location.json existe mas é inválido.
 * - CONTENTFLOW_CONFIG_WRITE_FAILED: seleção obrigatória não pôde ser persistida.
 * - CONTENTFLOW_DATABASE_MISSING: seleção persistida cujo banco desapareceu.
 * - CONTENTFLOW_DATABASE_INVALID: banco existente que não é arquivo regular.
 * - CONTENTFLOW_SYMLINK_INVALID: symlink quebrado ou com loop no destino.
 * - CONTENTFLOW_DESTINATION_INVALID: destino não é diretório utilizável.
 * - CONTENTFLOW_DATA_INSIDE_APPLICATION: destino dentro do bundle do app.
 * - CONTENTFLOW_AMBIGUOUS_DATABASES: bancos em múltiplos caminhos sem escolha.
 *
 * Invariantes:
 * - Nenhuma gravação acontece antes de validar dados, userData e o destino
 *   da configuração (incluindo ancestrais físicos e fronteira do bundle).
 * - Persistência é atômica (arquivo temporário + rename no mesmo diretório);
 *   falha ao persistir seleção obrigatória bloqueia, nunca segue com warn.
 * - Banco/symlink existente porém inválido bloqueia na descoberta; o SQLite
 *   precisa ser arquivo regular para contar como banco existente.
 * - Este módulo nunca cria `contentflow.sqlite`; só resolve e persiste JSON.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { assertWritableDataOutsideApp } = require("./desktop-paths.cjs");

const CONFIG_FILENAME = "data-location.json";
const CONFIG_SCHEMA_VERSION = 1;

function getCandidatePaths(appDataDir) {
  return [
    {
      id: "contentflow-os",
      label: "ContentFlow OS (Instalação Existente)",
      userData: path.join(appDataDir, "ContentFlow OS"),
      dataDir: path.join(appDataDir, "ContentFlow OS", "data"),
      sqliteFile: path.join(appDataDir, "ContentFlow OS", "data", "contentflow.sqlite"),
    },
    {
      id: "contentflow",
      label: "ContentFlow (Caminho Padrão)",
      userData: path.join(appDataDir, "ContentFlow"),
      dataDir: path.join(appDataDir, "ContentFlow", "data"),
      sqliteFile: path.join(appDataDir, "ContentFlow", "data", "contentflow.sqlite"),
    },
  ];
}

function defaultAppDataDir(env) {
  if (process.platform === "darwin") {
    return path.join(env.HOME || "", "Library", "Application Support");
  }
  return path.join(env.HOME || "", ".config");
}

// Resolve o caminho físico, tolerando folhas ainda não criadas (instalação
// nova), mas sem tolerar symlinks quebrados ou loops.
function physicalPath(value) {
  const resolved = path.resolve(value);
  try {
    return fs.realpathSync(resolved);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      const parent = path.dirname(resolved);
      if (parent === resolved) throw error;
      return path.join(physicalPath(parent), path.basename(resolved));
    }
    throw error;
  }
}

function validateDestinationPair(rawDataDir, rawUserData) {
  if (typeof rawDataDir !== "string" || rawDataDir.trim() === "") {
    throw new Error("CONTENTFLOW_DESTINATION_INVALID: dataDir ausente ou inválido.");
  }
  if (typeof rawUserData !== "string" || rawUserData.trim() === "") {
    throw new Error("CONTENTFLOW_DESTINATION_INVALID: userData ausente ou inválido.");
  }
  const dataDir = path.resolve(rawDataDir);
  const userData = path.resolve(rawUserData);

  for (const candidate of [dataDir, userData]) {
    let linkStat = null;
    try {
      linkStat = fs.lstatSync(candidate);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw new Error(
          `CONTENTFLOW_DESTINATION_INVALID: não foi possível inspecionar ${candidate}: ${error && error.message ? error.message : String(error)}`,
        );
      }
    }
    if (linkStat && linkStat.isSymbolicLink() && !fs.existsSync(candidate)) {
      throw new Error(
        `CONTENTFLOW_SYMLINK_INVALID: symlink quebrado em ${candidate}. ` +
          "Corrija o link ou ajuste a seleção do diretório de dados.",
      );
    }
    try {
      physicalPath(candidate);
    } catch (error) {
      const code = error && error.code ? error.code : "";
      if (code === "ELOOP" || code === "EINVAL" || code === "ENAMETOOLONG") {
        throw new Error(
          `CONTENTFLOW_SYMLINK_INVALID: symlink inválido em ${candidate} (${code}). ` +
            "Corrija o link ou ajuste a seleção do diretório de dados.",
        );
      }
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: destino ilegível ${candidate}: ${error && error.message ? error.message : String(error)}`,
      );
    }
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: ${candidate} existe e não é um diretório.`,
      );
    }
  }

  return { dataDir, userData };
}

function validateConfigSchema(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "raiz JSON deve ser um objeto";
  }
  if (typeof data.dataDir !== "string" || data.dataDir.trim() === "") {
    return "campo obrigatório ausente ou inválido: dataDir";
  }
  if (typeof data.userData !== "string" || data.userData.trim() === "") {
    return "campo obrigatório ausente ou inválido: userData";
  }
  if (data.schema_version !== undefined && data.schema_version !== CONFIG_SCHEMA_VERSION) {
    return `schema_version não suportado: ${JSON.stringify(data.schema_version)}`;
  }
  if (data.selection_reason !== undefined && typeof data.selection_reason !== "string") {
    return "campo inválido: selection_reason";
  }
  return null;
}

function readConfigFile(filePath) {
  let linkStat = null;
  try {
    linkStat = fs.lstatSync(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return { status: "absent" };
    // Falha fechada: caminho ilegível (permissão, componente bloqueado)
    // nunca equivale a "sem configuração".
    return {
      status: "invalid",
      reason: `inacessível (${(error && error.code) || (error && error.message) || String(error)})`,
    };
  }
  if (!linkStat.isFile()) {
    return { status: "invalid", reason: "não é um arquivo regular" };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return { status: "invalid", reason: error && error.message ? error.message : String(error) };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "JSON inválido" };
  }
  const schemaError = validateConfigSchema(data);
  if (schemaError) return { status: "invalid", reason: schemaError };
  return { status: "ok", data };
}

function writeConfigAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const nonce = crypto.randomBytes(6).toString("hex");
  const tmpPath = `${filePath}.tmp.${process.pid}.${nonce}`;
  const payload = JSON.stringify(data, null, 2);
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, "w", 0o600);
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignora: limpeza abaixo remove o temporário
      }
    }
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {
      // Se o rename já moveu o arquivo, não há o que limpar.
    }
  }
}

function persistSelection(filePath, payload, appRoot) {
  // Toda a validação (par data/userData no chamador + destino da config
  // aqui) acontece antes de qualquer gravação. Falha de persistência de
  // seleção obrigatória bloqueia a inicialização: operar sem persistir
  // perderia a escolha do operador na próxima abertura.
  assertConfigWritable(filePath);
  enforceBundleBoundary(appRoot, [path.dirname(path.resolve(filePath))]);
  try {
    writeConfigAtomic(filePath, payload);
  } catch (error) {
    throw new Error(
      `CONTENTFLOW_CONFIG_WRITE_FAILED: seleção válida, mas data-location.json não pôde ser gravado em ${filePath} ` +
        `(${(error && error.message) || String(error)}). ` +
        "Inicialização suspensa para não operar sem persistir a seleção.",
    );
  }
}

// Classifica o SQLite candidato: "absent" (nada ali) ou "file" (banco
// utilizável). Existente porém inválido (diretório, symlink quebrado/loop,
// alvo não-regular, ilegível) BLOQUEIA em vez de ser ignorado.
function classifySqlite(sqlitePath) {
  let stat;
  try {
    stat = fs.lstatSync(sqlitePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return "absent";
    if (error && error.code === "ELOOP") {
      throw new Error(
        `CONTENTFLOW_SYMLINK_INVALID: loop de symlink em ${sqlitePath}. ` +
          "Corrija o link ou ajuste a seleção com o app fechado.",
      );
    }
    throw new Error(
      `CONTENTFLOW_DATABASE_INVALID: não foi possível inspecionar ${sqlitePath} ` +
        `(${(error && error.code) || (error && error.message) || String(error)}). ` +
        "Nada foi alterado; verifique o caminho com o app fechado.",
    );
  }
  if (stat.isSymbolicLink()) {
    let real;
    try {
      real = fs.realpathSync(sqlitePath);
    } catch {
      throw new Error(
        `CONTENTFLOW_SYMLINK_INVALID: symlink de banco quebrado ou com loop: ${sqlitePath}. ` +
          "Corrija o link ou ajuste a seleção com o app fechado.",
      );
    }
    let target;
    try {
      target = fs.statSync(real);
    } catch {
      throw new Error(
        `CONTENTFLOW_SYMLINK_INVALID: alvo ilegível do symlink de banco: ${sqlitePath}. ` +
          "Corrija o link ou ajuste a seleção com o app fechado.",
      );
    }
    if (!target.isFile()) {
      throw new Error(
        `CONTENTFLOW_DATABASE_INVALID: alvo do symlink de banco não é arquivo regular: ${sqlitePath}. ` +
          "Nada foi alterado; verifique o caminho com o app fechado.",
      );
    }
    return "file";
  }
  if (!stat.isFile()) {
    throw new Error(
      `CONTENTFLOW_DATABASE_INVALID: ${sqlitePath} existe mas não é um arquivo SQLite regular. ` +
        "Nada foi alterado; verifique o caminho com o app fechado.",
    );
  }
  return "file";
}

// Valida o destino da configuração antes de qualquer gravação: o arquivo
// precisa estar ausente ou ser regular, e cada ancestral existente precisa
// ser diretório (ou symlink válido para diretório).
function assertConfigWritable(filePath) {
  const resolved = path.resolve(filePath);
  let self;
  try {
    self = fs.lstatSync(resolved);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: destino de configuração ilegível ${resolved}: ` +
          `${(error && error.message) || String(error)}`,
      );
    }
  }
  if (self) {
    if (self.isSymbolicLink()) {
      throw new Error(
        `CONTENTFLOW_SYMLINK_INVALID: destino de configuração é symlink: ${resolved}. ` +
          "Corrija com o app fechado; nada foi gravado.",
      );
    }
    if (!self.isFile()) {
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: destino de configuração não é arquivo regular: ${resolved}. ` +
          "Nada foi gravado.",
      );
    }
  }
  let current = path.dirname(resolved);
  let previous = null;
  while (current !== previous) {
    let ancestor;
    try {
      ancestor = fs.lstatSync(current);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        previous = current;
        current = path.dirname(current);
        continue;
      }
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: ancestral ilegível do destino de configuração ${current}: ` +
          `${(error && error.message) || String(error)}`,
      );
    }
    if (ancestor.isSymbolicLink()) {
      let real;
      try {
        real = fs.realpathSync(current);
      } catch {
        throw new Error(
          `CONTENTFLOW_SYMLINK_INVALID: symlink inválido em ancestral do destino de configuração: ${current}. ` +
            "Nada foi gravado.",
        );
      }
      if (!fs.statSync(real).isDirectory()) {
        throw new Error(
          `CONTENTFLOW_DESTINATION_INVALID: ancestral do destino de configuração não é diretório: ${current}. ` +
            "Nada foi gravado.",
        );
      }
    } else if (!ancestor.isDirectory()) {
      throw new Error(
        `CONTENTFLOW_DESTINATION_INVALID: componente do caminho de configuração não é diretório: ${current}. ` +
          "Nada foi gravado.",
      );
    }
    break;
  }
}

// Fronteira do bundle: destinos de dados e da configuração nunca podem
// residir dentro do aplicativo. Exige appRoot (main.cjs informa
// app.getAppPath()); sem appRoot a checagem é ignorada (testes sintéticos).
function enforceBundleBoundary(appRoot, targets) {
  if (!appRoot) return;
  for (const target of targets) {
    assertWritableDataOutsideApp(appRoot, target);
  }
}

function resolveDataLocation(options = {}) {
  const env = options.env || process.env;
  const appDataDir = options.appDataDir || defaultAppDataDir(env);
  const appRoot = options.appRoot || null;
  const promptCallback = options.promptCallback || null;

  // 1. Variáveis de ambiente explícitas (prioridade máxima; sem gravação).
  // CONTENTFLOW_ELECTRON_USER_DATA_DIR sozinha deriva `<userData>/data`.
  const envDataDir = env.CONTENTFLOW_DESKTOP_DATA_DIR;
  const envUserData = env.CONTENTFLOW_ELECTRON_USER_DATA_DIR;
  const hasDataDir = typeof envDataDir === "string" && envDataDir.trim() !== "";
  const hasUserData = typeof envUserData === "string" && envUserData.trim() !== "";
  if (hasDataDir || hasUserData) {
    const rawUserData = hasUserData ? envUserData : path.dirname(path.resolve(envDataDir));
    const rawDataDir = hasDataDir
      ? envDataDir
      : path.join(path.resolve(envUserData), "data");
    const validated = validateDestinationPair(rawDataDir, rawUserData);
    enforceBundleBoundary(appRoot, [validated.dataDir, validated.userData]);
    return {
      dataDir: validated.dataDir,
      userData: validated.userData,
      source: "env_explicit",
      sqliteFile: path.join(validated.dataDir, "contentflow.sqlite"),
    };
  }

  // 2. Configuração persistente (leitura estrita: inválida bloqueia).
  const primaryConfig = path.join(appDataDir, "ContentFlow", CONFIG_FILENAME);
  const legacyConfig = path.join(appDataDir, "ContentFlow OS", CONFIG_FILENAME);
  const primary = readConfigFile(primaryConfig);
  if (primary.status === "invalid") {
    throw new Error(
      `CONTENTFLOW_CONFIG_INVALID: ${primaryConfig} existe mas é inválido (${primary.reason}). ` +
        "Corrija ou remova o arquivo com o app fechado; nenhuma seleção automática será feita.",
    );
  }
  let persistent = primary.status === "ok" ? { data: primary.data, path: primaryConfig } : null;
  if (!persistent) {
    const legacy = readConfigFile(legacyConfig);
    if (legacy.status === "invalid") {
      throw new Error(
        `CONTENTFLOW_CONFIG_INVALID: ${legacyConfig} existe mas é inválido (${legacy.reason}). ` +
          "Corrija ou remova o arquivo com o app fechado; nenhuma seleção automática será feita.",
      );
    }
    if (legacy.status === "ok") persistent = { data: legacy.data, path: legacyConfig };
  }

  if (persistent) {
    const validated = validateDestinationPair(persistent.data.dataDir, persistent.data.userData);
    enforceBundleBoundary(appRoot, [validated.dataDir, validated.userData]);
    const expectedSqlite = path.join(validated.dataDir, "contentflow.sqlite");
    if (classifySqlite(expectedSqlite) === "file") {
      return {
        dataDir: validated.dataDir,
        userData: validated.userData,
        source: "persistent_config",
        sqliteFile: expectedSqlite,
      };
    }
    // Sem isenções: seleção persistida cujo banco desapareceu (removido ou
    // desconectado) bloqueia. Tratar como instalação nova criaria um banco
    // vazio silenciosamente e orfanaria os dados do operador.
    throw new Error(
      `CONTENTFLOW_DATABASE_MISSING: a seleção persistida em ${persistent.path} aponta para ` +
        `${validated.dataDir}, mas contentflow.sqlite não existe mais ali. ` +
        "Restaure o banco ou ajuste a seleção com o app fechado; o ContentFlow não criará um banco vazio silenciosamente.",
    );
  }

  // 3. Avaliação dos caminhos candidatos (nenhuma config válida presente).
  // Banco/symlink existente porém inválido bloqueia aqui: nunca cai em fresh.
  const candidates = getCandidatePaths(appDataDir);
  const existingCandidates = candidates.filter(
    (candidate) => classifySqlite(candidate.sqliteFile) === "file",
  );

  if (existingCandidates.length === 1) {
    const chosen = existingCandidates[0];
    const validated = validateDestinationPair(chosen.dataDir, chosen.userData);
    enforceBundleBoundary(appRoot, [validated.dataDir, validated.userData]);
    persistSelection(
      primaryConfig,
      {
        schema_version: CONFIG_SCHEMA_VERSION,
        dataDir: validated.dataDir,
        userData: validated.userData,
        selection_reason: "auto_detected_single_existing",
        selected_at: new Date().toISOString(),
      },
      appRoot,
    );
    return {
      dataDir: validated.dataDir,
      userData: validated.userData,
      source: "auto_detected_unique",
      sqliteFile: path.join(validated.dataDir, "contentflow.sqlite"),
    };
  }

  if (existingCandidates.length > 1) {
    if (typeof promptCallback === "function") {
      const selected = promptCallback(existingCandidates);
      const match =
        selected && typeof selected === "object"
          ? existingCandidates.find(
              (candidate) =>
                path.resolve(selected.dataDir || "") === path.resolve(candidate.dataDir) &&
                path.resolve(selected.userData || "") === path.resolve(candidate.userData),
            )
          : null;
      if (match) {
        const validated = validateDestinationPair(match.dataDir, match.userData);
        enforceBundleBoundary(appRoot, [validated.dataDir, validated.userData]);
        persistSelection(
          primaryConfig,
          {
            schema_version: CONFIG_SCHEMA_VERSION,
            dataDir: validated.dataDir,
            userData: validated.userData,
            selection_reason: "operator_explicit_choice",
            selected_at: new Date().toISOString(),
          },
          appRoot,
        );
        return {
          dataDir: validated.dataDir,
          userData: validated.userData,
          source: "operator_prompt",
          sqliteFile: path.join(validated.dataDir, "contentflow.sqlite"),
        };
      }
    }
    throw new Error(
      "CONTENTFLOW_AMBIGUOUS_DATABASES: foram encontrados bancos de dados distintos em múltiplos caminhos:\n" +
        `${existingCandidates.map((candidate) => ` - ${candidate.label}: ${candidate.dataDir}`).join("\n")}\n` +
        "Nenhuma seleção foi realizada. O ContentFlow não combinará nem escolherá automaticamente um banco por data/tamanho. Inicialização suspensa para proteger os dados.",
    );
  }

  // 4. Instalação nova: somente sem config e sem nenhum banco existente.
  // Não persiste nada: ainda não há escolha nem banco a preservar, e os
  // caminhos padrão são determinísticos (reabertura devolve o mesmo lugar).
  // Persistir aqui criaria o estado ambíguo "config existe, banco não",
  // indistinguível de um banco removido/desconectado — que deve bloquear.
  const defaultCandidate = candidates.find((candidate) => candidate.id === "contentflow") || candidates[0];
  const validated = validateDestinationPair(defaultCandidate.dataDir, defaultCandidate.userData);
  enforceBundleBoundary(appRoot, [validated.dataDir, validated.userData]);
  return {
    dataDir: validated.dataDir,
    userData: validated.userData,
    source: "fresh_install_default",
    sqliteFile: path.join(validated.dataDir, "contentflow.sqlite"),
  };
}

module.exports = {
  resolveDataLocation,
  getCandidatePaths,
  CONFIG_FILENAME,
};
