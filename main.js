"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const obsidian_1 = require("obsidian");
const zlib = __importStar(require("zlib"));
const cp = __importStar(require("child_process"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const AI_PRESETS = {
    off: { label: "Desligada", kind: "off", baseUrl: "", model: "" },
    github: {
        label: "GitHub Models (conta GitHub)",
        kind: "openai",
        baseUrl: "https://models.github.ai/inference",
        model: "openai/gpt-4.1",
    },
    "copilot-cli": {
        label: "GitHub Copilot CLI (experimental)",
        kind: "cli",
        baseUrl: "",
        model: "",
    },
    openai: {
        label: "OpenAI",
        kind: "openai",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4.1",
    },
    ollama: {
        label: "Ollama (local)",
        kind: "openai",
        baseUrl: "http://localhost:11434/v1",
        model: "llama3.1",
    },
    anthropic: {
        label: "Anthropic (Claude)",
        kind: "anthropic",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-5-5",
    },
    custom: {
        label: "Outro (compatível com OpenAI)",
        kind: "openai",
        baseUrl: "",
        model: "",
    },
};
function aiKindOf(s) {
    const p = AI_PRESETS[s.aiPreset];
    return p ? p.kind : "off";
}
const DEFAULT_SETTINGS = {
    outputFolder: "PDF Import",
    maxLevel: 2,
    useOutline: true,
    removeHeadersFooters: true,
    autoLink: true,
    minTitleLinkLength: 8,
    extractImages: true,
    minImageSize: 50,
    detectCode: true,
    detectFlows: true,
    detectEmphasis: true,
    detectTables: true,
    detectCallouts: true,
    stepsFlow: true,
    aiPreset: "off",
    aiBaseUrl: "https://models.github.ai/inference",
    aiApiKey: "",
    aiModel: "openai/gpt-4.1",
    aiCliCommand: "copilot",
    aiImages: false,
    aiCleanup: false,
    aiSummary: true,
    aiFlow: true,
    aiLinks: true,
    aiMaxImages: 30,
    aiMaxSections: 80,
    aiMaxSectionChars: 12000,
};
const REF_RE = /\b(cap[ií]tulo|cap\.|se[cç][aã]o|se[cç]\.|item|t[óo]pico|chapter|section|sec\.)\s+(\d+(?:\.\d+)*)/gi;
const LEADING_NUM_RE = /^\s*(?:(?:cap[ií]tulo|chapter|se[cç][aã]o|section)\s+)?(\d+(?:\.\d+)*)[.):]?\s+/i;
const BULLET_RE = /^([•●▪◦■□▫‣⁃·–—-]|\\?\*)\s+/;
const FLOW_ARROW = /\s*(?:-{1,3}>|={1,3}>|→|➔|➜|➞|⟶|⇒|➡|►)\s*/;
const CALLOUT_RE = /^(?:\*\*)?(Note|Nota|Observa[çc][ãa]o|Obs\.|Warning|Aviso|Aten[çc][ãa]o|Caution|Cuidado|Important|Importante|Tip|Dica|Danger|Perigo)(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*([\s\S]*)$/i;
const CAPTION_RE = /^(Figura|Figure|Fig\.|Tabela|Table|Quadro|Gr[aá]fico|Chart|Listagem|Listing)\s+\d+([.\-–]\d+)?\s*[.:–—-]?\s+\S/i;
const STEP_WORDS = /(procedimento|passos?|etapas?|sequ[eê]ncia|fluxo|processo|siga|steps?|procedure|process|workflow|follow)/i;
const MERMAID_START = /^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|gantt|journey|mindmap|timeline|pie|gitGraph|block-beta|quadrantChart|requirementDiagram)\b/;
/* ------------------------------------------------------------------ */
/* Utilidades PNG (sem canvas)                                         */
/* ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++)
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++)
        out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
}
function deflate(raw) {
    return new Promise((res, rej) => zlib.deflate(raw, (e, r) => (e ? rej(e) : res(r))));
}
/** Codifica pixels brutos do pdf.js em PNG. mode: gray1 | gray8 | rgb | rgba */
async function encodePngRaw(data, w, h, mode) {
    const bytesPerPixel = mode === "rgba" ? 4 : mode === "rgb" ? 3 : 1;
    const rowBytes = mode === "gray1" ? Math.ceil(w / 8) : w * bytesPerPixel;
    const raw = new Uint8Array((rowBytes + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (rowBytes + 1)] = 0;
        raw.set(data.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
    }
    const colorType = mode === "rgba" ? 6 : mode === "rgb" ? 2 : 0;
    const bitDepth = mode === "gray1" ? 1 : 8;
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w);
    dv.setUint32(4, h);
    ihdr[8] = bitDepth;
    ihdr[9] = colorType;
    const idat = await deflate(raw);
    const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}
function sampleHash(bytes, w, h) {
    let hash = 2166136261;
    const step = Math.max(1, Math.floor(bytes.length / 8192));
    for (let i = 0; i < bytes.length; i += step) {
        hash ^= bytes[i];
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return `${w}x${h}-${bytes.length}-${hash.toString(16)}`;
}
function mulMatrix(m1, m2) {
    return [
        m1[0] * m2[0] + m1[1] * m2[2],
        m1[0] * m2[1] + m1[1] * m2[3],
        m1[2] * m2[0] + m1[3] * m2[2],
        m1[2] * m2[1] + m1[3] * m2[3],
        m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
        m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
    ];
}
/* ------------------------------------------------------------------ */
/* Utilidades de texto e IA                                            */
/* ------------------------------------------------------------------ */
function cleanText(s) {
    return s
        .replace(/\uFB00/g, "ff")
        .replace(/\uFB01/g, "fi")
        .replace(/\uFB02/g, "fl")
        .replace(/\uFB03/g, "ffi")
        .replace(/\uFB04/g, "ffl")
        .replace(/[\uFB05\uFB06]/g, "st")
        .replace(/[\u00AD\u200B-\u200D\uFEFF]/g, "")
        .replace(/[\u00A0\u2007\u202F]/g, " ");
}
const fontStyleCache = new Map();
/** Descobre negrito/itálico de uma fonte (só funciona depois de getOperatorList). */
function fontStyleOf(page, fontName) {
    const cached = fontStyleCache.get(fontName);
    if (cached)
        return cached;
    try {
        const store = page.commonObjs;
        const f = store && store.has(fontName) ? store.get(fontName) : null;
        if (f) {
            const nm = String(f.name || f.fallbackName || "");
            const v = {
                bold: !!f.bold || /bold|black|heavy|semibold|demibold/i.test(nm),
                italic: !!f.italic || /italic|oblique/i.test(nm),
            };
            fontStyleCache.set(fontName, v);
            return v;
        }
    }
    catch (e) {
        /* ignora */
    }
    return { bold: false, italic: false };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function parseMermaid(text) {
    if (!text)
        return null;
    const t = text.trim().replace(/^```(?:mermaid)?\s*/i, "").replace(/```\s*$/, "").trim();
    if (!t || /^N[AÃ]O\b/i.test(t))
        return null;
    return MERMAID_START.test(t) ? t : null;
}
function extractJson(text) {
    const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a < 0 || b <= a)
        return null;
    try {
        return JSON.parse(t.slice(a, b + 1));
    }
    catch (e) {
        return null;
    }
}
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
/** Cliente de IA: OpenAI-compatível (GitHub Models, OpenAI, Ollama...), Anthropic ou Copilot CLI. */
class AiClient {
    constructor(s) {
        this.s = s;
        this.ok = 0;
        this.fail = 0;
        this.lastError = "";
    }
    get kind() {
        return aiKindOf(this.s);
    }
    get canSeeImages() {
        return this.kind === "openai" || this.kind === "anthropic";
    }
    async chat(system, user, png) {
        let out = null;
        try {
            out = this.kind === "cli" ? await this.runCli(system, user) : await this.http(system, user, png);
        }
        catch (e) {
            this.lastError = String(e);
            console.warn("PDF para Notas: erro na IA", e);
        }
        if (out && out.trim()) {
            this.ok++;
            return out;
        }
        this.fail++;
        return null;
    }
    async http(system, user, png) {
        const s = this.s;
        const base = (s.aiBaseUrl || "").replace(/\/+$/, "");
        for (let attempt = 0; attempt < 3; attempt++) {
            let res;
            if (this.kind === "anthropic") {
                const content = [];
                if (png) {
                    content.push({
                        type: "image",
                        source: { type: "base64", media_type: "image/png", data: Buffer.from(png).toString("base64") },
                    });
                }
                content.push({ type: "text", text: user });
                res = await (0, obsidian_1.requestUrl)({
                    url: `${base || "https://api.anthropic.com"}/v1/messages`,
                    method: "POST",
                    headers: {
                        "x-api-key": s.aiApiKey,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: s.aiModel,
                        max_tokens: 4096,
                        system,
                        messages: [{ role: "user", content }],
                    }),
                    throw: false,
                });
            }
            else {
                const content = png
                    ? [
                        { type: "text", text: user },
                        {
                            type: "image_url",
                            image_url: { url: "data:image/png;base64," + Buffer.from(png).toString("base64") },
                        },
                    ]
                    : user;
                const headers = { "content-type": "application/json" };
                if (s.aiApiKey)
                    headers["Authorization"] = "Bearer " + s.aiApiKey;
                res = await (0, obsidian_1.requestUrl)({
                    url: `${base}/chat/completions`,
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        model: s.aiModel,
                        messages: [
                            { role: "system", content: system },
                            { role: "user", content },
                        ],
                    }),
                    throw: false,
                });
            }
            if (res.status === 200)
                return this.extract(res.json);
            if ((res.status === 429 || res.status >= 500) && attempt < 2) {
                const ra = Number((res.headers && (res.headers["retry-after"] || res.headers["Retry-After"])) || 0);
                await sleep((ra > 0 && ra < 60 ? ra : 3 * (attempt + 1)) * 1000);
                continue;
            }
            this.lastError = `HTTP ${res.status}: ${String(res.text || "").slice(0, 200)}`;
            console.warn("PDF para Notas: a IA retornou", res.status, res.text);
            return null;
        }
        return null;
    }
    extract(json) {
        if (!json)
            return null;
        if (this.kind === "anthropic") {
            const c = json.content;
            if (Array.isArray(c)) {
                return c
                    .filter((p) => p && p.type === "text")
                    .map((p) => p.text)
                    .join("");
            }
            return null;
        }
        const ch = json.choices && json.choices[0];
        const c = ch && ch.message && ch.message.content;
        if (typeof c === "string")
            return c;
        if (Array.isArray(c))
            return c.map((p) => (p && p.text ? p.text : "")).join("");
        return null;
    }
    /** Copilot CLI em modo não interativo: o prompt vai num arquivo numa pasta temporária. */
    runCli(system, user) {
        return new Promise((resolve) => {
            let dir = "";
            try {
                dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdf-notas-"));
                fs.writeFileSync(path.join(dir, "prompt.txt"), `${system}\n\n${user}`, "utf8");
            }
            catch (e) {
                this.lastError = String(e);
                resolve(null);
                return;
            }
            const win = process.platform === "win32";
            const q = (a) => (win && /\s/.test(a) ? `"${a}"` : a);
            const args = [
                "-p",
                "Leia o arquivo prompt.txt desta pasta e siga as instrucoes dele. Responda somente com o resultado final pedido, sem comentarios.",
                "-s",
                "--allow-tool=read",
            ];
            if (this.s.aiModel)
                args.push("--model", this.s.aiModel);
            const env = Object.assign({}, process.env);
            if (this.s.aiApiKey)
                env["COPILOT_GITHUB_TOKEN"] = this.s.aiApiKey;
            let out = "";
            let err = "";
            let done = false;
            const finish = (v) => {
                if (done)
                    return;
                done = true;
                try {
                    fs.rmSync(dir, { recursive: true, force: true });
                }
                catch (e) {
                    /* ignora */
                }
                resolve(v);
            };
            let child;
            try {
                child = cp.spawn(this.s.aiCliCommand || "copilot", args.map(q), {
                    cwd: dir,
                    env,
                    shell: win,
                    windowsHide: true,
                });
            }
            catch (e) {
                this.lastError = String(e);
                finish(null);
                return;
            }
            try {
                child.stdin.end();
            }
            catch (e) {
                /* ignora */
            }
            const timer = setTimeout(() => {
                try {
                    child.kill();
                }
                catch (e) {
                    /* ignora */
                }
                this.lastError = "tempo esgotado (Copilot CLI)";
                finish(null);
            }, 240000);
            child.stdout.on("data", (d) => (out += d.toString()));
            child.stderr.on("data", (d) => (err += d.toString()));
            child.on("error", (e) => {
                clearTimeout(timer);
                this.lastError =
                    e && e.code === "ENOENT" ? "comando do Copilot CLI não encontrado (informe o caminho completo)" : String(e);
                console.warn("PDF para Notas:", this.lastError);
                finish(null);
            });
            child.on("close", (code) => {
                clearTimeout(timer);
                if (code !== 0) {
                    this.lastError = `Copilot CLI saiu com código ${code}: ${err.slice(0, 200)}`;
                    console.warn("PDF para Notas:", this.lastError);
                    finish(null);
                }
                else {
                    finish(out.replace(ANSI_RE, "").trim());
                }
            });
        });
    }
}
/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */
const DIAGRAM_SYSTEM = "Você converte imagens de diagramas em código Mermaid.";
const DIAGRAM_USER = "Se esta imagem for um diagrama que pode ser representado em Mermaid (fluxograma, máquina de estados, " +
    "diagrama de sequência, arquitetura em blocos, organograma, ER, etc.), responda SOMENTE com o código " +
    "Mermaid válido, sem cercas de código e sem explicações. Mantenha os rótulos no idioma original. " +
    "Se NÃO for um diagrama desse tipo (foto, gráfico de dados, captura de tela, tabela, logotipo, " +
    "desenho técnico), responda exatamente: NAO";
const ANALYZE_SYSTEM = "Você ajuda a organizar notas técnicas no Obsidian criadas a partir de PDFs. " +
    "Responda SOMENTE com um objeto JSON válido (sem cercas de código, sem comentários, sem texto fora do JSON). " +
    "Nunca invente informações que não estejam no texto fornecido.";
const CLEAN_SYSTEM = "Você revisa a FORMATAÇÃO de texto em Markdown extraído de um PDF. Regras: não resuma, não traduza, " +
    "não acrescente nem remova informações; preserve todas as palavras, números, siglas e termos técnicos; " +
    "preserve exatamente os blocos de código (``` ... ```), os embeds de imagem ![[...]], os links [[...]] e os " +
    "callouts (> [!...]). Corrija apenas: quebras de linha e parágrafos indevidos, palavras hifenizadas, listas, " +
    "tabelas em Markdown, títulos óbvios (use ### ou mais) e ênfase em negrito/itálico. " +
    "Responda SOMENTE com o Markdown corrigido, sem comentários e sem cercas de código ao redor.";
/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */
class PdfParaNotasPlugin extends obsidian_1.Plugin {
    constructor() {
        super(...arguments);
        this.settings = DEFAULT_SETTINGS;
        this.layout = { margin: new Map(), right: new Map(), gMargin: 0, gRight: 0, lineGap: 12, body: 10 };
    }
    async onload() {
        await this.loadSettings();
        this.addRibbonIcon("file-text", "PDF para Notas: converter PDF", () => {
            new ImportModal(this.app, this).open();
        });
        this.addCommand({
            id: "converter-pdf",
            name: "Converter PDF em notas…",
            callback: () => new ImportModal(this.app, this).open(),
        });
        this.addCommand({
            id: "converter-pdf-ativo",
            name: "Converter PDF ativo em notas",
            checkCallback: (checking) => {
                const f = this.app.workspace.getActiveFile();
                if (f && f.extension === "pdf") {
                    if (!checking)
                        this.convertVaultFile(f);
                    return true;
                }
                return false;
            },
        });
        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (file instanceof obsidian_1.TFile && file.extension === "pdf") {
                menu.addItem((item) => item
                    .setTitle("Converter PDF em notas Markdown")
                    .setIcon("file-text")
                    .onClick(() => this.convertVaultFile(file)));
            }
        }));
        this.addSettingTab(new PdfParaNotasSettingTab(this.app, this));
    }
    async loadSettings() {
        const data = (await this.loadData()) || {};
        // migração da v0.2
        if (data.aiDiagrams && !data.aiPreset) {
            data.aiPreset = "anthropic";
            data.aiBaseUrl = "https://api.anthropic.com";
            data.aiImages = true;
        }
        if (data.apiKey && !data.aiApiKey)
            data.aiApiKey = data.apiKey;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    }
    async saveSettings() {
        await this.saveData(this.settings);
    }
    aiReady() {
        const s = this.settings;
        const k = aiKindOf(s);
        if (k === "off")
            return false;
        if (k === "cli")
            return true;
        if (k === "anthropic")
            return !!s.aiApiKey;
        return (!!s.aiBaseUrl && !!s.aiModel && (!!s.aiApiKey || /localhost|127\.0\.0\.1/.test(s.aiBaseUrl)));
    }
    wantsAiImages() {
        return this.settings.aiImages && this.aiReady() && aiKindOf(this.settings) !== "cli";
    }
    /* ------------------------- entrada -------------------------- */
    async convertVaultFile(file) {
        const buf = await this.app.vault.readBinary(file);
        await this.convert(buf, file.basename);
    }
    async convert(buf, baseName) {
        const notice = new obsidian_1.Notice("PDF para Notas: lendo PDF…", 0);
        try {
            const pdfjs = await (0, obsidian_1.loadPdfJs)();
            const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) })
                .promise;
            const docName = this.sanitize(baseName) || "PDF";
            const folder = (0, obsidian_1.normalizePath)(`${this.settings.outputFolder}/${docName}`);
            await this.ensureFolder(folder);
            const imgCtx = {
                dir: (0, obsidian_1.normalizePath)(`${folder}/imagens`),
                slug: docName.replace(/\s+/g, "-").slice(0, 40),
                dirReady: false,
            };
            let lines = await this.extractLines(pdf, pdfjs, imgCtx, (p, n) => notice.setMessage(`PDF para Notas: extraindo texto e imagens (${p}/${n})…`));
            if (this.settings.removeHeadersFooters) {
                lines = this.removeHeadersFooters(lines, pdf.numPages);
            }
            if (this.settings.extractImages) {
                lines = await this.dropRepeatedImages(lines, pdf.numPages);
            }
            if (lines.length === 0) {
                notice.hide();
                new obsidian_1.Notice("Nenhum texto encontrado. O PDF pode ser escaneado (precisa de OCR).");
                return;
            }
            this.applyMonoGuard(lines);
            this.layout = this.computeLayout(lines);
            this.markBoldHeadings(lines);
            const ai = this.aiReady() ? new AiClient(this.settings) : null;
            if (ai && this.settings.aiImages) {
                if (ai.canSeeImages)
                    await this.annotateDiagrams(lines, ai, notice);
                else
                    new obsidian_1.Notice("PDF para Notas: o Copilot CLI não lê imagens; “figuras → Mermaid” foi ignorado.");
            }
            notice.setMessage("PDF para Notas: detectando capítulos e seções…");
            let heads = null;
            if (this.settings.useOutline) {
                heads = await this.headingsFromOutline(pdf, lines);
            }
            if (!heads || heads.length < 2) {
                heads = this.headingsFromFonts(lines);
            }
            if (heads.length < 2) {
                heads = this.headingsByPageChunks(lines, pdf.numPages, 10);
            }
            heads = this.normalizeLevels(heads);
            const sections = this.buildSections(lines, heads, baseName);
            if (ai) {
                await this.aiPipeline(sections, ai, notice);
                this.reportAi(ai);
            }
            notice.setMessage("PDF para Notas: gerando notas…");
            const indexFile = await this.writeNotes(sections, baseName, docName, folder, pdf.numPages);
            const all = sections.map((s) => s.body).join("\n");
            const nImgs = (all.match(/^!\[\[/gm) || []).length;
            const fences = (all.match(/^(?:> )?```/gm) || []).length;
            const nMermaid = (all.match(/^(?:> )?```mermaid/gm) || []).length + sections.filter((s) => s.ai && s.ai.flow).length;
            const nCode = Math.max(0, Math.floor(fences / 2) - (all.match(/^(?:> )?```mermaid/gm) || []).length);
            notice.hide();
            new obsidian_1.Notice(`PDF para Notas: ${sections.length} notas, ${nImgs} imagens, ${nCode} blocos de código, ${nMermaid} diagramas.`);
            if (indexFile) {
                await this.app.workspace.getLeaf(false).openFile(indexFile);
            }
        }
        catch (e) {
            console.error(e);
            notice.hide();
            new obsidian_1.Notice("PDF para Notas: erro ao converter (veja o console).");
        }
    }
    reportAi(ai) {
        if (ai.ok === 0 && ai.fail > 0) {
            new obsidian_1.Notice("PDF para Notas: a IA não respondeu" +
                (ai.lastError ? ` (${ai.lastError.slice(0, 160)})` : "") +
                ". Confira serviço, chave e modelo nas configurações.", 10000);
        }
    }
    /* ---------------------- extração de texto ------------------- */
    async extractLines(pdf, pdfjs, imgCtx, onProgress) {
        const out = [];
        const keepPng = this.wantsAiImages();
        const emph = this.settings.detectEmphasis;
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const vp = page.getViewport({ scale: 1 });
            const H = vp.height || 1;
            const W = vp.width || 1;
            let opList = null;
            if (this.settings.extractImages || emph) {
                try {
                    opList = await page.getOperatorList();
                }
                catch (e) {
                    opList = null;
                }
            }
            const tc = await page.getTextContent();
            const styles = tc.styles || {};
            const its = tc.items
                .filter((it) => typeof it.str === "string" && it.str.length > 0)
                .map((it) => {
                const fam = String((styles[it.fontName] && styles[it.fontName].fontFamily) || "");
                const st = emph ? fontStyleOf(page, it.fontName) : { bold: false, italic: false };
                return {
                    str: cleanText(it.str),
                    x: it.transform[4],
                    y: it.transform[5],
                    w: it.width || 0,
                    size: Math.hypot(it.transform[0], it.transform[1]) ||
                        it.height ||
                        10,
                    mono: fam.indexOf("monospace") >= 0,
                    bold: st.bold,
                    italic: st.italic,
                };
            })
                // itens só de espaço (o pdf.js os cria para lacunas largas) atrapalham a medição de colunas
                .filter((it) => it.str.trim().length > 0);
            its.sort((a, b) => b.y - a.y || a.x - b.x);
            const groups = [];
            for (const it of its) {
                const last = groups[groups.length - 1];
                if (last && Math.abs(last[0].y - it.y) <= Math.max(2, it.size * 0.4)) {
                    last.push(it);
                }
                else {
                    groups.push([it]);
                }
            }
            const pageLines = [];
            for (const g of groups) {
                g.sort((a, b) => a.x - b.x);
                const widths = [];
                for (const it of g) {
                    if (it.mono && it.w > 0 && it.str.length >= 2)
                        widths.push(it.w / it.str.length);
                }
                widths.sort((a, b) => a - b);
                const charW = widths.length ? widths[Math.floor(widths.length / 2)] : g[0].size * 0.6;
                let plain = "";
                let code = "";
                let prevEnd = -Infinity;
                const segs = [];
                const cells = [];
                let monoChars = 0;
                let boldChars = 0;
                let nonMonoChars = 0;
                let totalChars = 0;
                for (const it of g) {
                    const gap = it.x - prevEnd;
                    const needSpace = plain.length > 0 &&
                        gap > it.size * 0.15 &&
                        !plain.endsWith(" ") &&
                        !it.str.startsWith(" ");
                    if (needSpace) {
                        plain += " ";
                        if (segs.length)
                            segs[segs.length - 1].s += " ";
                    }
                    plain += it.str;
                    if (code.length > 0 && gap > charW * 0.5) {
                        code += " ".repeat(Math.max(1, Math.round(gap / charW)));
                    }
                    code += it.str;
                    if (cells.length === 0 || gap > Math.max(it.size * 1.6, 12)) {
                        cells.push({ x: it.x, text: it.str });
                    }
                    else {
                        cells[cells.length - 1].text += (needSpace ? " " : "") + it.str;
                    }
                    const blank = it.str.trim() === "";
                    const prevSeg = segs.length ? segs[segs.length - 1] : null;
                    const f = blank && prevSeg ? prevSeg : it;
                    if (prevSeg && prevSeg.mono === f.mono && prevSeg.bold === f.bold && prevSeg.italic === f.italic) {
                        prevSeg.s += it.str;
                    }
                    else {
                        segs.push({ s: it.str, mono: f.mono, bold: f.bold, italic: f.italic });
                    }
                    const n = it.str.replace(/\s/g, "").length;
                    totalChars += n;
                    if (it.mono)
                        monoChars += n;
                    else {
                        nonMonoChars += n;
                        if (it.bold)
                            boldChars += n;
                    }
                    prevEnd = it.x + it.w;
                }
                const text = plain.replace(/\s+/g, " ").trim();
                if (!text)
                    continue;
                let inline = "";
                for (const sg of segs) {
                    const raw = sg.mono ? sg.s : sg.s.replace(/\*/g, "\\*");
                    const mt = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
                    const inner = mt[2];
                    if (sg.mono) {
                        inline += inner.length >= 2 ? mt[1] + "`" + inner.replace(/`/g, "'") + "`" + mt[3] : raw;
                    }
                    else if (emph && inner.length >= 2 && (sg.bold || sg.italic)) {
                        const mk = sg.bold && sg.italic ? "***" : sg.bold ? "**" : "*";
                        inline += mt[1] + mk + inner + mk + mt[3];
                    }
                    else {
                        inline += raw;
                    }
                }
                inline = inline.replace(/\s+/g, " ").trim();
                let main = g[0];
                for (const it of g)
                    if (it.str.length > main.str.length)
                        main = it;
                pageLines.push({
                    page: p - 1,
                    y: g[0].y,
                    size: Math.round(main.size * 2) / 2,
                    text,
                    inline,
                    code: code.replace(/\s+$/, ""),
                    rel: g[0].y / H,
                    x: g[0].x,
                    x2: prevEnd,
                    mono: totalChars > 0 && monoChars / totalChars >= 0.9,
                    charW,
                    bold: nonMonoChars > 0 && boldChars / nonMonoChars >= 0.9,
                    cells: cells
                        .map((c) => ({ x: c.x, text: c.text.replace(/\s+/g, " ").trim() }))
                        .filter((c) => c.text.length > 0),
                });
            }
            if (this.settings.extractImages) {
                const imgs = await this.extractPageImages(page, p - 1, W, H, pdfjs, imgCtx, pageLines.length, keepPng, opList);
                for (const im of imgs)
                    pageLines.push(im);
            }
            pageLines.sort((a, b) => b.y - a.y);
            for (const l of pageLines)
                out.push(l);
            try {
                page.cleanup();
            }
            catch (e) {
                /* ignora */
            }
            onProgress(p, pdf.numPages);
            if (p % 5 === 0)
                await new Promise((r) => setTimeout(r, 0));
        }
        return out;
    }
    /* ------------------- layout e subtítulos -------------------- */
    computeLayout(lines) {
        const weight = new Map();
        for (const l of lines) {
            if (l.image || l.mono)
                continue;
            weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
        }
        let body = 10;
        let best = -1;
        weight.forEach((w, s) => {
            if (w > best) {
                best = w;
                body = s;
            }
        });
        const votes = new Map();
        const gvotes = new Map();
        const rights = new Map();
        const grights = [];
        for (const l of lines) {
            if (l.image || l.mono || l.text.length < 15 || l.cells.length >= 2)
                continue;
            const xr = Math.round(l.x / 2) * 2;
            let m = votes.get(l.page);
            if (!m) {
                m = new Map();
                votes.set(l.page, m);
            }
            m.set(xr, (m.get(xr) || 0) + 1);
            gvotes.set(xr, (gvotes.get(xr) || 0) + 1);
            let r = rights.get(l.page);
            if (!r) {
                r = [];
                rights.set(l.page, r);
            }
            r.push(l.x2);
            grights.push(l.x2);
        }
        const mode = (m) => {
            let bx = 0;
            let bc = -1;
            m.forEach((c, x) => {
                if (c > bc) {
                    bc = c;
                    bx = x;
                }
            });
            return bx;
        };
        const pct = (a) => {
            if (!a.length)
                return 0;
            const s = a.slice().sort((x, y) => x - y);
            return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))];
        };
        const margin = new Map();
        votes.forEach((m, p) => margin.set(p, mode(m)));
        const right = new Map();
        rights.forEach((r, p) => right.set(p, pct(r)));
        const gaps = [];
        for (let i = 1; i < lines.length; i++) {
            const a = lines[i - 1];
            const b = lines[i];
            if (a.image || b.image || a.mono || b.mono || a.page !== b.page)
                continue;
            if (Math.abs(a.size - b.size) > 0.6)
                continue;
            const g = a.y - b.y;
            if (g > 0 && g < b.size * 2.2)
                gaps.push(g);
        }
        gaps.sort((x, y) => x - y);
        const lineGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : body * 1.2;
        return { margin, right, gMargin: mode(gvotes), gRight: pct(grights), lineGap, body };
    }
    marginOf(page) {
        const v = this.layout.margin.get(page);
        return v === undefined ? this.layout.gMargin : v;
    }
    rightOf(page) {
        const v = this.layout.right.get(page);
        return v === undefined ? this.layout.gRight : v;
    }
    /** Linhas curtas inteiras em negrito viram subtítulos (####). */
    markBoldHeadings(lines) {
        if (!this.settings.detectEmphasis)
            return;
        const L = this.layout;
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l.image || l.mono || !l.bold || l.cells.length >= 2 || l.sub !== undefined)
                continue;
            const t = l.text;
            if (t.length < 3 || t.length > 80 || /[.;,]$/.test(t) || /^\d+$/.test(t))
                continue;
            if (CALLOUT_RE.test(t))
                continue;
            if (l.size < L.body * 0.95)
                continue;
            const prev = lines[i - 1];
            if (prev && !prev.image && prev.page === l.page) {
                const gap = prev.y - l.y;
                if (gap < L.lineGap * 1.25 && !/[.!?:]$/.test(prev.text))
                    continue;
            }
            l.sub = 4;
        }
    }
    /* --------------------------- imagens ------------------------ */
    getPdfImage(page, name) {
        return new Promise((resolve) => {
            let done = false;
            const fin = (v) => {
                if (!done) {
                    done = true;
                    resolve(v);
                }
            };
            try {
                const store = typeof name === "string" && name.startsWith("g_") ? page.commonObjs : page.objs;
                store.get(name, (img) => fin(img));
            }
            catch (e) {
                fin(null);
            }
            setTimeout(() => fin(null), 8000);
        });
    }
    async encodePdfImage(img) {
        if (!img)
            return null;
        try {
            if (img.data && img.width && img.height) {
                const w = img.width;
                const h = img.height;
                if (w * h > 40000000)
                    return null;
                const data = img.data;
                const L = data.length;
                let mode = null;
                if (img.kind === 3 && L >= w * h * 4)
                    mode = "rgba";
                else if (img.kind === 2 && L >= w * h * 3)
                    mode = "rgb";
                else if (img.kind === 1 && L >= Math.ceil(w / 8) * h)
                    mode = "gray1";
                else if (L >= w * h * 4)
                    mode = "rgba";
                else if (L >= w * h * 3)
                    mode = "rgb";
                else if (L >= w * h)
                    mode = "gray8";
                else if (L >= Math.ceil(w / 8) * h)
                    mode = "gray1";
                if (!mode)
                    return null;
                return { png: await encodePngRaw(data, w, h, mode), w, h };
            }
            if (img.bitmap && typeof document !== "undefined") {
                const c = document.createElement("canvas");
                c.width = img.bitmap.width;
                c.height = img.bitmap.height;
                const ctx = c.getContext("2d");
                if (!ctx)
                    return null;
                ctx.drawImage(img.bitmap, 0, 0);
                const blob = await new Promise((r) => c.toBlob(r, "image/png"));
                if (!blob)
                    return null;
                return {
                    png: new Uint8Array(await blob.arrayBuffer()),
                    w: c.width,
                    h: c.height,
                };
            }
        }
        catch (e) {
            console.warn("PDF para Notas: falha ao codificar imagem", e);
        }
        return null;
    }
    async extractPageImages(page, pageIdx, W, H, pdfjs, ctx, textLines, keepPng, opList) {
        const out = [];
        const OPS = pdfjs && pdfjs.OPS;
        if (!OPS)
            return out;
        if (!opList)
            return out;
        const hits = [];
        let ctm = [1, 0, 0, 1, 0, 0];
        const stack = [];
        for (let i = 0; i < opList.fnArray.length; i++) {
            const fn = opList.fnArray[i];
            const args = opList.argsArray[i];
            if (fn === OPS.save)
                stack.push(ctm.slice());
            else if (fn === OPS.restore) {
                const m = stack.pop();
                if (m)
                    ctm = m;
            }
            else if (fn === OPS.transform)
                ctm = mulMatrix(args, ctm);
            else if (fn === OPS.paintFormXObjectBegin) {
                stack.push(ctm.slice());
                if (Array.isArray(args && args[0]))
                    ctm = mulMatrix(args[0], ctm);
            }
            else if (fn === OPS.paintFormXObjectEnd) {
                const m = stack.pop();
                if (m)
                    ctm = m;
            }
            else if (fn === OPS.paintImageXObject) {
                hits.push({ name: args[0], inline: null, ctm: ctm.slice() });
            }
            else if (fn === OPS.paintInlineImageXObject) {
                hits.push({ name: null, inline: args[0], ctm: ctm.slice() });
            }
        }
        let n = 0;
        for (const h of hits) {
            const wPt = Math.hypot(h.ctm[0], h.ctm[1]);
            const hPt = Math.hypot(h.ctm[2], h.ctm[3]);
            if (wPt < 24 || hPt < 24)
                continue;
            if (Math.max(wPt, hPt) / Math.min(wPt, hPt) > 12)
                continue; // linhas/divisores
            if ((wPt * hPt) / (W * H) > 0.85 && textLines >= 5)
                continue; // fundo de página
            const img = h.inline ? h.inline : await this.getPdfImage(page, h.name);
            const enc = await this.encodePdfImage(img);
            if (!enc)
                continue;
            if (Math.min(enc.w, enc.h) < this.settings.minImageSize)
                continue;
            n++;
            const name = `${ctx.slug}-p${String(pageIdx + 1).padStart(3, "0")}-${n}.png`;
            const path = (0, obsidian_1.normalizePath)(`${ctx.dir}/${name}`);
            if (!ctx.dirReady) {
                await this.ensureFolder(ctx.dir);
                ctx.dirReady = true;
            }
            await this.writeBinary(path, enc.png);
            const cy = (h.ctm[1] + h.ctm[3]) / 2 + h.ctm[5];
            out.push({
                page: pageIdx,
                y: cy,
                size: 0,
                text: "",
                inline: "",
                code: "",
                rel: cy / H,
                x: h.ctm[4],
                x2: h.ctm[4],
                mono: false,
                charW: 0,
                bold: false,
                cells: [],
                image: {
                    path,
                    name,
                    width: enc.w,
                    height: enc.h,
                    hash: sampleHash(enc.png, enc.w, enc.h),
                    png: keepPng ? enc.png : undefined,
                },
            });
        }
        return out;
    }
    /** Remove logos/ícones repetidos em muitas páginas. */
    async dropRepeatedImages(lines, numPages) {
        const pagesByHash = new Map();
        for (const l of lines) {
            if (!l.image)
                continue;
            if (!pagesByHash.has(l.image.hash))
                pagesByHash.set(l.image.hash, new Set());
            pagesByHash.get(l.image.hash).add(l.page);
        }
        const minPages = Math.max(3, Math.floor(numPages * 0.3));
        const bad = new Set();
        pagesByHash.forEach((set, h) => {
            if (numPages >= 5 && set.size >= minPages)
                bad.add(h);
        });
        if (bad.size === 0)
            return lines;
        const out = [];
        for (const l of lines) {
            if (l.image && bad.has(l.image.hash)) {
                try {
                    await this.app.vault.adapter.remove(l.image.path);
                }
                catch (e) {
                    /* ignora */
                }
            }
            else
                out.push(l);
        }
        return out;
    }
    /** Se o documento todo for monoespaçado, não trata nada como código. */
    applyMonoGuard(lines) {
        let mono = 0;
        let total = 0;
        for (const l of lines) {
            if (l.image)
                continue;
            total += l.text.length;
            if (l.mono)
                mono += l.text.length;
        }
        if (total > 0 && mono / total > 0.6) {
            for (const l of lines) {
                l.mono = false;
                l.inline = l.text;
            }
        }
    }
    /* ------------------------- IA (opcional) -------------------- */
    async annotateDiagrams(lines, ai, notice) {
        const imgs = lines
            .filter((l) => l.image && l.image.png)
            .slice(0, Math.max(0, this.settings.aiMaxImages));
        let idx = 0;
        let done = 0;
        const worker = async () => {
            while (idx < imgs.length) {
                const im = imgs[idx++].image;
                try {
                    if (im.png && im.png.length <= 3500000) {
                        const r = await ai.chat(DIAGRAM_SYSTEM, DIAGRAM_USER, im.png);
                        const m = parseMermaid(r);
                        if (m)
                            im.mermaid = m;
                    }
                }
                catch (e) {
                    console.warn("PDF para Notas: falha na análise de figura", e);
                }
                done++;
                notice.setMessage(`PDF para Notas: IA analisando figuras (${done}/${imgs.length})…`);
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        for (const l of lines)
            if (l.image)
                delete l.image.png;
    }
    async aiPipeline(sections, ai, notice) {
        const s = this.settings;
        if (!(s.aiCleanup || s.aiSummary || s.aiFlow || s.aiLinks))
            return;
        const strip = (t) => t.replace(/!\[\[[^\]]*\]\]/g, "").trim();
        const targets = sections
            .filter((x) => strip(x.body).length >= 80)
            .slice(0, Math.max(0, s.aiMaxSections));
        if (!targets.length)
            return;
        const titleMap = new Map();
        for (const x of sections) {
            for (const k of [this.norm(this.cleanTitle(x)), this.norm(x.title)]) {
                if (k && !titleMap.has(k))
                    titleMap.set(k, x);
            }
        }
        let idx = 0;
        let done = 0;
        const worker = async () => {
            while (idx < targets.length) {
                const sec = targets[idx++];
                try {
                    if (s.aiCleanup)
                        sec.body = await this.aiCleanBody(sec.body, ai);
                    if (s.aiSummary || s.aiFlow || s.aiLinks) {
                        await this.aiAnalyze(sec, sections, titleMap, ai);
                    }
                }
                catch (e) {
                    console.warn("PDF para Notas: falha da IA na seção", sec.title, e);
                }
                done++;
                notice.setMessage(`PDF para Notas: IA analisando seções (${done}/${targets.length})…`);
            }
        };
        const n = ai.kind === "cli" ? 1 : 2;
        const ws = [];
        for (let i = 0; i < n; i++)
            ws.push(worker());
        await Promise.all(ws);
    }
    async aiAnalyze(sec, all, titleMap, ai) {
        const s = this.settings;
        const text = sec.body
            .replace(/!\[\[[^\]]*\]\]/g, "")
            .slice(0, Math.max(1000, s.aiMaxSectionChars));
        const titles = s.aiLinks
            ? all
                .filter((x) => x !== sec)
                .slice(0, 250)
                .map((x) => "- " + (this.cleanTitle(x) || x.title).slice(0, 90))
                .join("\n")
            : "";
        const fields = [];
        if (s.aiSummary) {
            fields.push('"resumo": string — 3 a 6 tópicos curtos em Markdown (cada linha começando com "- "), no mesmo idioma do texto e fiéis a ele (não invente nada)');
        }
        if (s.aiFlow) {
            fields.push('"fluxo": array de strings — as linhas de um diagrama Mermaid (flowchart TD/LR, stateDiagram-v2 ou sequenceDiagram) SOMENTE se o texto descrever um processo, procedimento, sequência de etapas, máquina de estados ou arquitetura que mereça diagrama; caso contrário []. Rótulos curtos entre aspas duplas, no idioma do texto, usando só o que está no texto');
        }
        if (s.aiLinks) {
            fields.push('"relacionadas": array com até 5 títulos EXATOS (da lista abaixo) de seções claramente relacionadas a esta', '"links": array com até 8 objetos {"frase": trecho EXATO (1 a 6 palavras) copiado do texto desta seção, "alvo": título EXATO da lista abaixo} — só quando o trecho de fato se refere ao assunto da outra seção');
        }
        const user = `Título da seção: ${sec.title}\n\nTexto da seção:\n"""\n${text}\n"""\n\n` +
            (titles ? `Outras seções do documento (use exatamente estes títulos):\n${titles}\n\n` : "") +
            `Responda com um único objeto JSON com os campos:\n${fields.map((f) => "- " + f).join("\n")}`;
        const raw = await ai.chat(ANALYZE_SYSTEM, user);
        if (!raw)
            return;
        const obj = extractJson(raw);
        if (!obj)
            return;
        const res = {};
        if (s.aiSummary && obj.resumo) {
            const r = Array.isArray(obj.resumo) ? obj.resumo.join("\n") : String(obj.resumo);
            const ls = r
                .split("\n")
                .map((x) => x.trim())
                .filter((x) => x.length > 0)
                .slice(0, 8)
                .map((x) => "- " + x.replace(/^[-*•]\s+/, ""));
            if (ls.length)
                res.summary = ls.join("\n");
        }
        if (s.aiFlow && obj.fluxo) {
            const f = Array.isArray(obj.fluxo) ? obj.fluxo.map(String).join("\n") : String(obj.fluxo);
            const m = f.split("\n").length >= 3 ? parseMermaid(f) : null;
            if (m)
                res.flow = m;
        }
        const find = (t) => {
            const k = this.norm(String(t || ""));
            const x = k ? titleMap.get(k) : undefined;
            return x && x !== sec ? x : null;
        };
        if (s.aiLinks) {
            if (Array.isArray(obj.relacionadas)) {
                const rel = [];
                for (const t of obj.relacionadas) {
                    const x = find(t);
                    if (x && rel.indexOf(x) < 0)
                        rel.push(x);
                }
                if (rel.length)
                    res.related = rel.slice(0, 5);
            }
            if (Array.isArray(obj.links)) {
                const lower = sec.body.toLowerCase();
                const links = [];
                for (const lk of obj.links) {
                    const phrase = lk && typeof lk.frase === "string" ? lk.frase.trim() : "";
                    const target = lk ? find(lk.alvo) : null;
                    if (phrase.length < 2 || phrase.length > 60 || !target)
                        continue;
                    if (lower.indexOf(phrase.toLowerCase()) < 0)
                        continue;
                    if (links.some((x) => x.phrase.toLowerCase() === phrase.toLowerCase()))
                        continue;
                    links.push({ phrase, target });
                }
                if (links.length)
                    res.links = links.slice(0, 8);
            }
        }
        sec.ai = res;
    }
    chunkMarkdown(body, max) {
        const raw = body.split("\n\n");
        const blocks = [];
        let fence = false;
        for (const part of raw) {
            const n = (part.match(/^```/gm) || []).length;
            if (fence)
                blocks[blocks.length - 1] += "\n\n" + part;
            else
                blocks.push(part);
            if (n % 2 === 1)
                fence = !fence;
        }
        const chunks = [];
        let cur = "";
        for (const b of blocks) {
            if (cur && cur.length + b.length + 2 > max) {
                chunks.push(cur);
                cur = b;
            }
            else
                cur = cur ? cur + "\n\n" + b : b;
        }
        if (cur)
            chunks.push(cur);
        return chunks;
    }
    async aiCleanBody(body, ai) {
        if (body.length > this.settings.aiMaxSectionChars * 2)
            return body;
        const out = [];
        for (const c of this.chunkMarkdown(body, 6000))
            out.push(await this.aiCleanChunk(c, ai));
        return out.join("\n\n");
    }
    async aiCleanChunk(c, ai) {
        const prose = c.replace(/```[\s\S]*?```/g, "").replace(/!\[\[[^\]]*\]\]/g, "");
        if (prose.replace(/\s/g, "").length < 200)
            return c;
        const r = await ai.chat(CLEAN_SYSTEM, c);
        if (!r)
            return c;
        let t = r.trim();
        const m = /^```(?:markdown|md)\s*\n([\s\S]*?)\n```\s*$/i.exec(t);
        if (m)
            t = m[1];
        const embeds = (x) => (x.match(/!\[\[[^\]]*\]\]/g) || []).sort().join("|");
        const fences = (x) => (x.match(/^```/gm) || []).length;
        if (embeds(t) !== embeds(c) || fences(t) !== fences(c))
            return c;
        const ratio = t.length / c.length;
        if (ratio < 0.75 || ratio > 1.3)
            return c;
        return t;
    }
    /* ------------------ cabeçalhos / rodapés -------------------- */
    removeHeadersFooters(lines, numPages) {
        const key = (t) => t.toLowerCase().replace(/\d+/g, "#").trim();
        const pagesByKey = new Map();
        for (const l of lines) {
            if (l.image)
                continue;
            if (l.rel > 0.92 || l.rel < 0.08) {
                const k = key(l.text);
                if (!pagesByKey.has(k))
                    pagesByKey.set(k, new Set());
                pagesByKey.get(k).add(l.page);
            }
        }
        const minPages = Math.max(3, Math.floor(numPages * 0.3));
        return lines.filter((l) => {
            if (l.image)
                return true;
            if (l.rel > 0.92 || l.rel < 0.08) {
                if (/^\d{1,4}$/.test(l.text))
                    return false;
                const set = pagesByKey.get(key(l.text));
                if (set && numPages >= 5 && set.size >= minPages)
                    return false;
            }
            return true;
        });
    }
    /* ----------------------- detecção de títulos ---------------- */
    norm(s) {
        return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    }
    firstIdxAtOrAfterPage(lines, page) {
        for (let i = 0; i < lines.length; i++)
            if (lines[i].page >= page)
                return i;
        return lines.length;
    }
    async headingsFromOutline(pdf, lines) {
        const outline = await pdf.getOutline();
        if (!outline || outline.length === 0)
            return null;
        const flat = [];
        const walk = async (items, level) => {
            for (const it of items) {
                let page = -1;
                try {
                    let dest = it.dest;
                    if (typeof dest === "string")
                        dest = await pdf.getDestination(dest);
                    if (Array.isArray(dest)) {
                        const ref = dest[0];
                        page = typeof ref === "object" ? await pdf.getPageIndex(ref) : ref;
                    }
                }
                catch (e) {
                    page = -1;
                }
                if (page >= 0 && it.title && level <= 6) {
                    flat.push({ title: String(it.title).trim(), level, page });
                }
                if (it.items && it.items.length)
                    await walk(it.items, level + 1);
            }
        };
        await walk(outline, 1);
        const max = this.settings.maxLevel;
        if (flat.filter((e) => e.level <= max).length < 2)
            return null;
        const heads = [];
        let prevEnd = -1;
        for (const e of flat) {
            const deep = e.level > max;
            const pageFirst = this.firstIdxAtOrAfterPage(lines, e.page);
            const cursor = Math.max(prevEnd + 1, pageFirst);
            const nt = this.norm(e.title);
            let found = -1;
            for (let i = cursor; i < lines.length && lines[i].page <= e.page + 1; i++) {
                if (lines[i].image || lines[i].mono)
                    continue;
                const n = this.norm(lines[i].text);
                if (n.length >= 3 && nt.length >= 3 && (nt.startsWith(n) || n.startsWith(nt))) {
                    found = i;
                    break;
                }
            }
            if (found >= 0) {
                let end = found;
                let acc = this.norm(lines[found].text);
                while (acc.length < nt.length &&
                    end + 1 < lines.length &&
                    !lines[end + 1].image &&
                    !lines[end + 1].mono &&
                    nt.startsWith(acc)) {
                    end++;
                    acc += this.norm(lines[end].text);
                }
                if (!(nt.startsWith(acc) || acc.startsWith(nt)))
                    end = found;
                if (deep) {
                    // níveis abaixo do limite viram subtítulos dentro da nota
                    for (let k = found; k <= end; k++)
                        lines[k].sub = Math.min(3, e.level - max);
                    continue;
                }
                heads.push({ level: e.level, title: e.title, start: found, end });
                prevEnd = end;
            }
            else if (!deep) {
                heads.push({ level: e.level, title: e.title, start: cursor, end: cursor - 1 });
                prevEnd = cursor - 1;
            }
        }
        return heads;
    }
    headingsFromFonts(lines) {
        const weight = new Map();
        for (const l of lines) {
            if (l.image || l.mono)
                continue;
            weight.set(l.size, (weight.get(l.size) || 0) + l.text.length);
        }
        let body = 10;
        let best = -1;
        weight.forEach((w, s) => {
            if (w > best) {
                best = w;
                body = s;
            }
        });
        const NUM_RE = /^(\d+(\.\d+){0,3}[.)]?|[IVXLC]+\.|(cap[ií]tulo|chapter|se[cç][aã]o|section|parte|part|ap[eê]ndice|appendix)\s+[\dIVXLC]+)\s+\S/i;
        const cand = [];
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l.image || l.mono)
                continue;
            const t = l.text;
            if (t.length < 3 || t.length > 120)
                continue;
            if (/^\d+$/.test(t))
                continue;
            const numbered = NUM_RE.test(t);
            if (/[.;,]$/.test(t) && !numbered)
                continue;
            const big = l.size >= body * 1.15;
            if (big || (numbered && l.size >= body * 1.05 && t.length <= 80 && !/[.;]$/.test(t))) {
                cand.push(i);
            }
        }
        const count = new Map();
        for (const i of cand)
            count.set(lines[i].size, (count.get(lines[i].size) || 0) + 1);
        const sizes = Array.from(count.keys())
            .filter((s) => count.get(s) <= Math.max(5, lines.length * 0.06))
            .sort((a, b) => b - a);
        const levelOf = new Map();
        sizes.forEach((s, idx) => levelOf.set(s, idx + 1));
        const heads = [];
        for (const i of cand) {
            const level = levelOf.get(lines[i].size);
            if (!level)
                continue;
            if (level > this.settings.maxLevel) {
                lines[i].sub = Math.min(3, level - this.settings.maxLevel);
                continue;
            }
            const prev = heads[heads.length - 1];
            if (prev &&
                prev.end === i - 1 &&
                prev.level === level &&
                lines[prev.end].page === lines[i].page &&
                lines[prev.end].y - lines[i].y < lines[i].size * 1.8) {
                prev.title += " " + lines[i].text;
                prev.end = i;
            }
            else {
                heads.push({ level, title: lines[i].text, start: i, end: i });
            }
        }
        return heads;
    }
    headingsByPageChunks(lines, numPages, chunk) {
        const heads = [];
        for (let p = 0; p < numPages; p += chunk) {
            const start = this.firstIdxAtOrAfterPage(lines, p);
            if (start >= lines.length)
                break;
            if (heads.length && heads[heads.length - 1].start === start)
                continue;
            heads.push({
                level: 1,
                title: `Páginas ${p + 1}–${Math.min(p + chunk, numPages)}`,
                start,
                end: start - 1,
            });
        }
        return heads;
    }
    normalizeLevels(heads) {
        if (heads.length === 0)
            return heads;
        const min = Math.min(...heads.map((h) => h.level));
        let prev = 0;
        for (const h of heads) {
            h.level = h.level - min + 1;
            if (h.level > prev + 1)
                h.level = prev + 1;
            prev = h.level;
        }
        return heads;
    }
    /* ----------------- conversão para Markdown ------------------ */
    parseFlow(text) {
        if (text.length > 220 || !FLOW_ARROW.test(text))
            return null;
        const parts = text
            .split(FLOW_ARROW)
            .map((p) => p.trim().replace(/^([•●▪◦■□–-]|\d+[.)])\s+/, ""));
        if (parts.length < 2 || parts.some((p) => !p))
            return null;
        // "O fluxo é: A -> B" → o primeiro nó é só o que vem depois dos dois-pontos
        const ci = parts[0].lastIndexOf(": ");
        if (ci >= 0)
            parts[0] = parts[0].slice(ci + 2).trim();
        if (!parts[0])
            return null;
        if (parts.some((p) => p.length > 60 || p.split(/\s+/).length > 8))
            return null;
        return parts;
    }
    classify(lines) {
        const segs = [];
        for (const l of lines) {
            if (l.image) {
                segs.push({ type: "image", lines: [l] });
                continue;
            }
            const last = segs[segs.length - 1];
            if (this.settings.detectCode && l.mono) {
                const prev = last && last.type === "code" ? last.lines[last.lines.length - 1] : null;
                if (prev &&
                    !(prev.page === l.page && prev.y - l.y > Math.max(prev.size, l.size) * 4)) {
                    last.lines.push(l);
                }
                else
                    segs.push({ type: "code", lines: [l] });
                continue;
            }
            let type = "text";
            if (l.sub === undefined) {
                if (this.settings.detectFlows && this.parseFlow(l.text) !== null)
                    type = "flow";
                else if (this.settings.detectTables && l.cells.length >= 2)
                    type = "table";
            }
            if (last && last.type === type)
                last.lines.push(l);
            else
                segs.push({ type, lines: [l] });
        }
        const out = [];
        for (const s of segs) {
            let seg = s;
            if (s.type === "flow") {
                const edges = s.lines.reduce((n, l) => n + ((this.parseFlow(l.text) || []).length - 1), 0);
                if (edges < 2)
                    seg = { type: "text", lines: s.lines };
            }
            else if (s.type === "table") {
                const md = this.buildTable(s.lines);
                seg = md ? { type: "table", lines: s.lines, md } : { type: "text", lines: s.lines };
            }
            const last = out[out.length - 1];
            if (seg.type === "text" && last && last.type === "text") {
                for (const l of seg.lines)
                    last.lines.push(l);
            }
            else
                out.push(seg);
        }
        return out;
    }
    toMarkdown(lines) {
        const parts = [];
        for (const s of this.classify(lines)) {
            if (s.type === "image")
                parts.push(this.renderImage(s.lines[0]));
            else if (s.type === "code")
                parts.push(this.renderCode(s.lines));
            else if (s.type === "flow")
                parts.push(this.renderFlow(s.lines));
            else if (s.type === "table")
                parts.push(s.md);
            else {
                const t = this.renderText(s.lines);
                if (t)
                    parts.push(t);
            }
        }
        return parts.join("\n\n");
    }
    renderImage(l) {
        const im = l.image;
        let md = `![[${im.name}${im.width > 600 ? "|600" : ""}]]`;
        if (im.mermaid) {
            md +=
                "\n\n_Diagrama reconstruído em Mermaid por IA a partir da figura acima — confira antes de usar._\n\n" +
                    "```mermaid\n" + im.mermaid + "\n```";
        }
        return md;
    }
    guessLang(c) {
        if (/^\s*#include\b|\bint\s+main\s*\(/m.test(c))
            return "c";
        if (/^\s*(def |import \w+|from \w+ import|class \w+.*:)/m.test(c) && !/[;{]\s*$/m.test(c))
            return "python";
        if (/\b(public|private)\s+(static\s+)?(class|void)\b/.test(c))
            return "java";
        if (/\b(console\.log|const |let |=>|function\s*\w*\()/.test(c))
            return "javascript";
        if (/^\s*(\$ |sudo |apt |npm |pip |git |cd |ls |chmod )/m.test(c))
            return "bash";
        if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/im.test(c))
            return "sql";
        if (/^\s*[{[]/.test(c) && /"\s*:/.test(c))
            return "json";
        if (/^\s*<\w+/.test(c) && /<\/\w+>/.test(c))
            return "html";
        return "";
    }
    renderCode(lines) {
        const baseX = Math.min(...lines.map((l) => l.x));
        const out = [];
        let prev = null;
        for (const l of lines) {
            if (prev && prev.page === l.page) {
                const gap = prev.y - l.y;
                const lh = Math.max(prev.size, l.size) * 1.2;
                const blanks = Math.min(2, Math.round(gap / lh) - 1);
                for (let i = 0; i < blanks; i++)
                    out.push("");
            }
            const cw = l.charW > 0 ? l.charW : l.size * 0.6;
            const indent = Math.max(0, Math.round((l.x - baseX) / cw));
            out.push(" ".repeat(indent) + l.code.replace(/\s+$/, ""));
            prev = l;
        }
        const body = out.join("\n");
        const fence = body.indexOf("```") >= 0 ? "~~~~" : "```";
        return `${fence}${this.guessLang(body)}\n${body}\n${fence}`;
    }
    mmEsc(s) {
        return s
            .replace(/[`*\\]/g, "")
            .replace(/"/g, "'")
            .replace(/#/g, "#35;")
            .replace(/</g, "‹")
            .replace(/>/g, "›");
    }
    renderFlow(lines) {
        const ids = new Map();
        const defs = [];
        const edges = new Set();
        const src = [];
        let n = 0;
        const idOf = (label) => {
            const k = this.norm(label) || label;
            let id = ids.get(k);
            if (!id) {
                id = "N" + ++n;
                ids.set(k, id);
                defs.push(`  ${id}["${this.mmEsc(label)}"]`);
            }
            return id;
        };
        for (const l of lines) {
            const parts = this.parseFlow(l.text);
            if (!parts)
                continue;
            src.push(`%% original: ${l.text.replace(/\n/g, " ")}`);
            for (let i = 0; i < parts.length - 1; i++) {
                edges.add(`  ${idOf(parts[i])} --> ${idOf(parts[i + 1])}`);
            }
        }
        const dir = n <= 6 ? "LR" : "TD";
        return ("```mermaid\n" +
            `flowchart ${dir}\n` +
            defs.join("\n") + "\n" +
            Array.from(edges).join("\n") + "\n" +
            src.join("\n") + "\n" +
            "```");
    }
    /** Monta uma tabela Markdown a partir de linhas com várias colunas alinhadas. */
    buildTable(lines) {
        if (lines.length < 3)
            return null;
        const xs = [];
        for (const l of lines)
            for (const c of l.cells)
                xs.push(c.x);
        xs.sort((a, b) => a - b);
        const clusters = [];
        for (const x of xs) {
            const last = clusters[clusters.length - 1];
            if (last && x - last.x <= 6) {
                last.x = (last.x * last.n + x) / (last.n + 1);
                last.n++;
            }
            else
                clusters.push({ x, n: 1 });
        }
        const minCount = Math.max(2, Math.ceil(lines.length * 0.4));
        const anchors = clusters.filter((c) => c.n >= minCount).map((c) => c.x);
        if (anchors.length < 2)
            return null;
        const rows = [];
        for (const l of lines) {
            const row = anchors.map(() => "");
            for (const c of l.cells) {
                let idx = 0;
                for (let k = 0; k < anchors.length; k++)
                    if (anchors[k] <= c.x + 6)
                        idx = k;
                row[idx] = row[idx] ? row[idx] + " " + c.text : c.text;
            }
            rows.push(row);
        }
        const filled = rows.filter((r) => r.filter((x) => x.trim()).length >= 2).length;
        if (filled < rows.length * 0.6)
            return null;
        let total = 0;
        let count = 0;
        let sentences = 0;
        for (const r of rows) {
            for (const c of r) {
                if (!c)
                    continue;
                total += c.length;
                count++;
                if (/[.!?]$/.test(c))
                    sentences++;
            }
        }
        if (count && total / count > 45 && sentences / count > 0.5)
            return null; // parece texto em colunas
        const esc = (s) => this.fixText(s.replace(/\|/g, "\\|"));
        const out = [];
        out.push("| " + rows[0].map(esc).join(" | ") + " |");
        out.push("| " + anchors.map(() => "---").join(" | ") + " |");
        for (let i = 1; i < rows.length; i++)
            out.push("| " + rows[i].map(esc).join(" | ") + " |");
        return out.join("\n");
    }
    /** Escapa o que o Markdown/Obsidian interpretaria errado (fora de `código`). */
    fixText(t) {
        return t
            .split(/(`[^`]*`)/)
            .map((part, i) => {
            if (i % 2 === 1)
                return part;
            let p = part.replace(/<(?=[A-Za-z\/!])/g, "\\<");
            if (i === 0)
                p = p.replace(/^([#>])/, "\\$1");
            return p.replace(/\[\[/g, "\\[\\[");
        })
            .join("");
    }
    formatParagraph(raw) {
        const t = this.fixText(raw);
        if (this.settings.detectCallouts) {
            const m = CALLOUT_RE.exec(t);
            if (m && m[2].trim()) {
                const kw = m[1].toLowerCase();
                const type = /warn|avis|aten|caution|cuid/.test(kw)
                    ? "warning"
                    : /danger|perig/.test(kw)
                        ? "danger"
                        : /tip|dica/.test(kw)
                            ? "tip"
                            : /important/.test(kw)
                                ? "info"
                                : "note";
                const body = m[2].trim().split("\n").map((l) => "> " + l).join("\n");
                return `> [!${type}] ${m[1]}\n${body}`;
            }
        }
        if (t.length < 220 && t.indexOf("*") < 0 && CAPTION_RE.test(t))
            return `*${t}*`;
        return t;
    }
    /** Lista numerada de etapas → fluxograma Mermaid (em callout recolhido). */
    stepsFlow(items, leadIn) {
        const nums = items.filter((r) => r.num > 0);
        if (nums.length < 3)
            return null;
        for (let k = 0; k < nums.length; k++)
            if (nums[k].num !== k + 1)
                return null;
        if (nums.length < 4 && !STEP_WORDS.test(leadIn))
            return null;
        if (nums.some((r) => r.text.length > 140))
            return null;
        const lines = ["flowchart TD"];
        nums.forEach((r, k) => {
            let label = r.text.replace(/\s+/g, " ");
            if (label.length > 70)
                label = label.slice(0, 67) + "…";
            lines.push(`  S${k + 1}["${r.num}. ${this.mmEsc(label)}"]`);
        });
        for (let k = 1; k < nums.length; k++)
            lines.push(`  S${k} --> S${k + 1}`);
        const body = ["```mermaid", ...lines, "```"].map((l) => "> " + l).join("\n");
        return `> [!example]- Fluxo das etapas\n${body}`;
    }
    renderText(lines) {
        const L = this.layout;
        const blocks = [];
        let cur = null;
        let prev = null;
        let lastNum = 0;
        const useInline = this.settings.detectCode || this.settings.detectEmphasis;
        const MARK_STRIP = /^(?:\*{1,3})?(?:[•●▪◦■□▫‣⁃·–—-]|\\\*|\d{1,3}[.)]|\(?[a-h][.)]|[\uE000-\uF8FF])(?:\*{1,3})?\s*/;
        for (const l of lines) {
            if (l.sub !== undefined) {
                const th = l.text.trim();
                if (!th)
                    continue;
                if (cur && cur.kind === "h" && cur.sub === l.sub && prev &&
                    prev.page === l.page && prev.y - l.y < Math.max(prev.size, l.size) * 1.8) {
                    cur.text += " " + th;
                }
                else {
                    if (cur)
                        blocks.push(cur);
                    cur = { kind: "h", text: th, num: 0, sub: l.sub, x: l.x, size: l.size };
                }
                prev = l;
                continue;
            }
            const plain = l.text.trim();
            const inl = (useInline ? l.inline : l.text).trim();
            if (!plain)
                continue;
            let kind = "p";
            let num = 0;
            let label = "";
            if (BULLET_RE.test(plain) || (/^[\uE000-\uF8FF]/.test(plain) && plain.length > 1)) {
                kind = "li";
            }
            else {
                const nm = /^(\d{1,3})[.)]\s+\S/.exec(plain);
                if (nm) {
                    const n = parseInt(nm[1], 10);
                    if (n === 1 || n === lastNum + 1) {
                        kind = "li";
                        num = n;
                        lastNum = n;
                    }
                }
                else {
                    const lm = /^\(?([a-h])[.)]\s+\S/.exec(plain);
                    if (lm) {
                        kind = "li";
                        label = lm[1] + ") ";
                    }
                }
            }
            const text = kind === "li" ? label + inl.replace(MARK_STRIP, "") : inl;
            let newBlock = false;
            if (!cur || cur.kind === "h")
                newBlock = true;
            else if (kind === "li")
                newBlock = true;
            else if (prev) {
                const sz = Math.max(prev.size, l.size);
                if (prev.page === l.page) {
                    const gap = prev.y - l.y;
                    const thr = Math.max(sz * 1.35, L.lineGap * 1.4);
                    const marg = this.marginOf(l.page);
                    const right = this.rightOf(l.page);
                    const endsSentence = /[.!?:;)"”]$/.test(prev.text);
                    const shortPrev = right > 0 && right - prev.x2 > sz * 5 && endsSentence;
                    const indented = cur.kind === "p" && /[.!?:]$/.test(prev.text) &&
                        l.x - marg > sz * 1.2 && l.x - marg < sz * 6;
                    newBlock = gap > thr || shortPrev || indented;
                }
                else {
                    const right = this.rightOf(prev.page);
                    newBlock = /[.!?:]$/.test(prev.text) && right > 0 && right - prev.x2 > sz * 3;
                }
            }
            if (newBlock) {
                if (cur)
                    blocks.push(cur);
                cur = { kind, text, num, sub: 0, x: l.x, size: l.size };
                if (kind === "p")
                    lastNum = 0;
            }
            else if (cur) {
                if (cur.text.endsWith("-") && /^\p{Ll}/u.test(text))
                    cur.text = cur.text.slice(0, -1) + text;
                else
                    cur.text += " " + text;
            }
            prev = l;
        }
        if (cur)
            blocks.push(cur);
        const out = [];
        let lead = "";
        let i = 0;
        while (i < blocks.length) {
            const b = blocks[i];
            if (b.kind === "h") {
                const lvl = b.sub === 4 ? 4 : Math.min(6, b.sub + 1);
                out.push("#".repeat(lvl) + " " + this.fixText(b.text));
                lead = b.text;
                i++;
            }
            else if (b.kind === "li") {
                let j = i;
                while (j < blocks.length && blocks[j].kind === "li")
                    j++;
                const run = blocks.slice(i, j);
                const baseX = Math.min(...run.map((r) => r.x));
                out.push(run
                    .map((r) => {
                    const lvl = Math.min(3, Math.max(0, Math.round((r.x - baseX) / (Math.max(r.size, 9) * 1.5))));
                    return "    ".repeat(lvl) + (r.num ? `${r.num}. ` : "- ") + this.fixText(r.text);
                })
                    .join("\n"));
                if (this.settings.stepsFlow) {
                    const f = this.stepsFlow(run, lead);
                    if (f)
                        out.push(f);
                }
                i = j;
            }
            else {
                out.push(this.formatParagraph(b.text));
                lead = b.text;
                i++;
            }
        }
        return out.join("\n\n");
    }
    sanitize(name) {
        return name
            .replace(/[\\/:*?"<>|#^[\]`]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80)
            .trim();
    }
    buildSections(lines, heads, baseName) {
        if (heads.length && heads[0].start > 0) {
            const pre = lines.slice(0, heads[0].start);
            const chars = pre.reduce((n, l) => n + l.text.length, 0);
            const hasImg = pre.some((l) => !!l.image);
            if (chars >= 200 || hasImg) {
                heads.unshift({
                    level: 1,
                    title: "Preâmbulo",
                    start: 0,
                    end: -1,
                    preamble: true,
                });
            }
        }
        const sections = [];
        const counters = [0, 0, 0, 0, 0, 0];
        const stack = [];
        const usedNames = new Set();
        heads.forEach((h, idx) => {
            const next = heads[idx + 1];
            const cs = h.end + 1;
            const ce = next ? next.start : lines.length;
            const slice = lines.slice(Math.max(0, cs), Math.max(cs, ce));
            let number = "0";
            if (!h.preamble) {
                counters[h.level - 1]++;
                for (let k = h.level; k < counters.length; k++)
                    counters[k] = 0;
                number = counters.slice(0, h.level).join(".");
            }
            while (stack.length && stack[stack.length - 1].level >= h.level)
                stack.pop();
            const parent = stack.length ? stack[stack.length - 1] : null;
            const m = LEADING_NUM_RE.exec(h.title);
            const explicitNumber = m ? m[1] : null;
            let fileName = this.sanitize(explicitNumber ? h.title : `${number} ${h.title}`);
            if (!fileName)
                fileName = `Seção ${sections.length + 1}`;
            let unique = fileName;
            let n = 2;
            while (usedNames.has(unique.toLowerCase()))
                unique = `${fileName} (${n++})`;
            usedNames.add(unique.toLowerCase());
            const firstLine = slice.length ? slice[0] : lines[Math.min(h.start, lines.length - 1)];
            const lastLine = slice.length ? slice[slice.length - 1] : firstLine;
            const startLine = h.end >= h.start ? lines[h.start] : firstLine;
            const sec = {
                level: h.level,
                title: h.title,
                number,
                explicitNumber,
                fileName: unique,
                pageStart: (startLine ? startLine.page : 0) + 1,
                pageEnd: (lastLine ? lastLine.page : 0) + 1,
                parent,
                children: [],
                body: this.toMarkdown(slice),
            };
            if (parent)
                parent.children.push(sec);
            stack.push(sec);
            sections.push(sec);
        });
        return sections;
    }
    /* ------------------------ links automáticos ----------------- */
    cleanTitle(s) {
        return s.title.replace(LEADING_NUM_RE, "").trim();
    }
    escapeRe(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    autoLink(sec, all, numMap) {
        let text = sec.body;
        if (!text)
            return text;
        const aiLinks = sec.ai && sec.ai.links ? sec.ai.links : [];
        if (!this.settings.autoLink && aiLinks.length === 0)
            return text;
        const tokens = [];
        const stash = (t) => {
            tokens.push(t);
            return `\u0000${tokens.length - 1}\u0000`;
        };
        // protege código, mermaid, imagens, `inline` e callouts de fluxo
        text = text.replace(/(?:^> )?```[\s\S]*?```|~~~~[\s\S]*?~~~~|!\[\[[^\]]*\]\]|`[^`\n]+`/gm, (m) => stash(m));
        // 1) links sugeridos pela IA (frase exata → seção alvo)
        for (const lk of aiLinks) {
            const re = new RegExp(`(?<![\\p{L}\\p{N}])${this.escapeRe(lk.phrase)}(?![\\p{L}\\p{N}])`, "iu");
            text = text.replace(re, (m) => stash(`[[${lk.target.fileName}|${m}]]`));
        }
        if (this.settings.autoLink) {
            // 2) referências explícitas: "seção 2.3", "capítulo 4"...
            text = text.replace(REF_RE, (m, _w, num) => {
                const target = numMap.get(num);
                if (!target || target === sec)
                    return m;
                return stash(`[[${target.fileName}|${m}]]`);
            });
            // 3) menções ao título de outra seção (primeira ocorrência)
            const minLen = this.settings.minTitleLinkLength;
            const candidates = all
                .filter((s) => {
                const t = this.cleanTitle(s);
                return s !== sec && t.length >= minLen && /\p{L}/u.test(t);
            })
                .sort((a, b) => this.cleanTitle(b).length - this.cleanTitle(a).length);
            let count = 0;
            for (const c of candidates) {
                if (count >= 20)
                    break;
                const re = new RegExp(`(?<![\\p{L}\\p{N}])${this.escapeRe(this.cleanTitle(c))}(?![\\p{L}\\p{N}])`, "iu");
                text = text.replace(re, (m) => {
                    count++;
                    return stash(`[[${c.fileName}|${m}]]`);
                });
            }
        }
        return text.replace(/\u0000(\d+)\u0000/g, (_m, i) => tokens[Number(i)]);
    }
    /* --------------------------- escrita ------------------------ */
    async ensureFolder(path) {
        const parts = (0, obsidian_1.normalizePath)(path).split("/").filter(Boolean);
        let cur = "";
        for (const p of parts) {
            cur = cur ? `${cur}/${p}` : p;
            if (!this.app.vault.getAbstractFileByPath(cur)) {
                await this.app.vault.createFolder(cur);
            }
        }
    }
    async writeFile(path, content) {
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof obsidian_1.TFile) {
            await this.app.vault.modify(existing, content);
            return existing;
        }
        return await this.app.vault.create(path, content);
    }
    async writeBinary(path, bytes) {
        const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof obsidian_1.TFile)
            await this.app.vault.modifyBinary(existing, data);
        else
            await this.app.vault.createBinary(path, data);
    }
    callout(type, title, content, folded = false) {
        return (`> [!${type}]${folded ? "-" : ""} ${title}\n` +
            content.split("\n").map((l) => "> " + l).join("\n"));
    }
    async writeNotes(sections, baseName, docName, folder, numPages) {
        const indexName = `Índice - ${docName}`;
        const numMap = new Map();
        for (const s of sections) {
            if (s.explicitNumber && !numMap.has(s.explicitNumber))
                numMap.set(s.explicitNumber, s);
        }
        for (const s of sections) {
            if (s.number !== "0" && !numMap.has(s.number))
                numMap.set(s.number, s);
        }
        for (let i = 0; i < sections.length; i++) {
            const s = sections[i];
            const prev = sections[i - 1];
            const next = sections[i + 1];
            const crumbs = [`[[${indexName}|📚 Índice]]`];
            const chain = [];
            for (let p = s.parent; p; p = p.parent)
                chain.unshift(p);
            for (const p of chain)
                crumbs.push(`[[${p.fileName}|${p.title}]]`);
            const body = this.autoLink(s, sections, numMap);
            let md = "---\n";
            md += `titulo: ${JSON.stringify(s.title)}\n`;
            md += `fonte: ${JSON.stringify(baseName + ".pdf")}\n`;
            md += `paginas: "${s.pageStart}-${Math.max(s.pageStart, s.pageEnd)}"\n`;
            md += `nivel: ${s.level}\n`;
            md += "tags: [pdf-import]\n";
            md += "---\n\n";
            md += crumbs.join(" › ") + "\n\n";
            md += `# ${s.title}\n\n`;
            if (s.ai && s.ai.summary) {
                md += this.callout("abstract", "Resumo (gerado por IA)", s.ai.summary) + "\n\n";
            }
            if (s.ai && s.ai.flow) {
                md +=
                    this.callout("example", "Fluxo (gerado por IA — confira)", "```mermaid\n" + s.ai.flow + "\n```", true) +
                        "\n\n";
            }
            md += body ? body + "\n\n" : "";
            if (s.children.length) {
                md += "## Subseções\n\n";
                for (const c of s.children)
                    md += `- [[${c.fileName}|${c.title}]]\n`;
                md += "\n";
            }
            const rel = ((s.ai && s.ai.related) || []).filter((r) => r !== s && r !== s.parent && s.children.indexOf(r) < 0);
            if (rel.length) {
                md += "## Veja também\n\n";
                for (const r of rel)
                    md += `- [[${r.fileName}|${r.title}]]\n`;
                md += "\n";
            }
            md += "---\n";
            const nav = [];
            if (prev)
                nav.push(`← [[${prev.fileName}|${prev.title}]]`);
            if (next)
                nav.push(`[[${next.fileName}|${next.title}]] →`);
            md += nav.join(" | ") + "\n";
            await this.writeFile((0, obsidian_1.normalizePath)(`${folder}/${s.fileName}.md`), md);
        }
        let idx = "---\ntags: [pdf-import, indice]\n---\n\n";
        idx += `# ${docName}\n\n`;
        idx += `> Importado de \`${baseName}.pdf\` · ${numPages} páginas · ${sections.length} notas\n\n`;
        for (const s of sections) {
            idx += `${"  ".repeat(s.level - 1)}- [[${s.fileName}|${s.title}]] _(p. ${s.pageStart})_\n`;
        }
        return await this.writeFile((0, obsidian_1.normalizePath)(`${folder}/${indexName}.md`), idx);
    }
}
exports.default = PdfParaNotasPlugin;
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */
class ImportModal extends obsidian_1.Modal {
    constructor(app, plugin) {
        super(app);
        this.diskFile = null;
        this.vaultPath = "";
        this.plugin = plugin;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "PDF para Notas" });
        new obsidian_1.Setting(contentEl)
            .setName("PDF do computador")
            .setDesc("Escolha um arquivo .pdf")
            .addButton((b) => {
            const input = contentEl.createEl("input", {
                type: "file",
                attr: { accept: ".pdf,application/pdf", style: "display:none" },
            });
            input.addEventListener("change", () => {
                this.diskFile = input.files && input.files[0] ? input.files[0] : null;
                b.setButtonText(this.diskFile ? this.diskFile.name : "Escolher arquivo…");
            });
            b.setButtonText("Escolher arquivo…").onClick(() => input.click());
        });
        const pdfs = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
        if (pdfs.length) {
            new obsidian_1.Setting(contentEl)
                .setName("ou PDF do vault")
                .addDropdown((d) => {
                d.addOption("", "—");
                for (const f of pdfs)
                    d.addOption(f.path, f.path);
                d.onChange((v) => (this.vaultPath = v));
            });
        }
        new obsidian_1.Setting(contentEl).addButton((b) => b
            .setButtonText("Converter")
            .setCta()
            .onClick(async () => {
            if (this.diskFile) {
                const f = this.diskFile;
                this.close();
                await this.plugin.convert(await f.arrayBuffer(), f.name.replace(/\.pdf$/i, ""));
            }
            else if (this.vaultPath) {
                const f = this.app.vault.getAbstractFileByPath(this.vaultPath);
                this.close();
                if (f instanceof obsidian_1.TFile)
                    await this.plugin.convertVaultFile(f);
            }
            else {
                new obsidian_1.Notice("Escolha um PDF primeiro.");
            }
        }));
    }
    onClose() {
        this.contentEl.empty();
    }
}
/* ------------------------------------------------------------------ */
/* Aba de configurações                                                */
/* ------------------------------------------------------------------ */
class PdfParaNotasSettingTab extends obsidian_1.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    toggle(c, name, desc, key) {
        const s = this.plugin.settings;
        new obsidian_1.Setting(c)
            .setName(name)
            .setDesc(desc)
            .addToggle((t) => t.setValue(!!s[key]).onChange(async (v) => {
            s[key] = v;
            await this.plugin.saveSettings();
        }));
    }
    num(c, name, desc, key, min, def) {
        const s = this.plugin.settings;
        new obsidian_1.Setting(c)
            .setName(name)
            .setDesc(desc)
            .addText((t) => t.setValue(String(s[key])).onChange(async (v) => {
            const n = parseInt(v, 10);
            s[key] = isNaN(n) ? def : Math.max(min, n);
            await this.plugin.saveSettings();
        }));
    }
    display() {
        const { containerEl } = this;
        const s = this.plugin.settings;
        containerEl.empty();
        containerEl.createEl("h2", { text: "PDF para Notas" });
        new obsidian_1.Setting(containerEl)
            .setName("Pasta de saída")
            .setDesc("Cada PDF vira uma subpasta dentro dela.")
            .addText((t) => t.setValue(s.outputFolder).onChange(async (v) => {
            s.outputFolder = v.trim() || "PDF Import";
            await this.plugin.saveSettings();
        }));
        new obsidian_1.Setting(containerEl)
            .setName("Níveis de título a separar")
            .setDesc("1 = só capítulos; 2 = capítulos e seções; 3 = até subseções. Títulos mais profundos viram subtítulos dentro da nota.")
            .addDropdown((d) => {
            ["1", "2", "3", "4"].forEach((n) => d.addOption(n, n));
            d.setValue(String(s.maxLevel)).onChange(async (v) => {
                s.maxLevel = Number(v);
                await this.plugin.saveSettings();
            });
        });
        this.toggle(containerEl, "Usar sumário (bookmarks) do PDF", "Se o PDF tiver sumário embutido, ele é a fonte mais confiável.", "useOutline");
        this.toggle(containerEl, "Remover cabeçalhos e rodapés repetidos", "", "removeHeadersFooters");
        this.toggle(containerEl, "Criar links automáticos entre seções", 'Converte "seção 2.3" e menções a títulos de outras seções em [[links]].', "autoLink");
        this.num(containerEl, "Tamanho mínimo do título para link por menção", "Evita linkar títulos genéricos e curtos.", "minTitleLinkLength", 3, 8);
        containerEl.createEl("h3", { text: "Formatação do texto" });
        this.toggle(containerEl, "Negrito e itálico", "Preserva ênfase; linhas curtas inteiras em negrito viram subtítulos (####).", "detectEmphasis");
        this.toggle(containerEl, "Tabelas", "Linhas com colunas alinhadas viram tabelas Markdown.", "detectTables");
        this.toggle(containerEl, "Avisos (Note/Warning/Dica…) como callouts", "", "detectCallouts");
        this.toggle(containerEl, "Listas numeradas de etapas → fluxo Mermaid", "Adiciona um fluxograma recolhido abaixo de listas numeradas de 4+ etapas (ou 3+ com “procedimento/passos” antes).", "stepsFlow");
        containerEl.createEl("h3", { text: "Imagens, código e diagramas" });
        this.toggle(containerEl, "Extrair imagens", "Salva as figuras em PNG na subpasta “imagens”. Logos repetidos em várias páginas são ignorados.", "extractImages");
        this.num(containerEl, "Tamanho mínimo da imagem (px)", "Ignora ícones menores que isso.", "minImageSize", 1, 50);
        this.toggle(containerEl, "Detectar código", "Fonte monoespaçada vira bloco de código; trechos curtos viram `código inline`.", "detectCode");
        this.toggle(containerEl, "Fluxos em texto → Mermaid", "Linhas como “A → B → C” (ou A -> B -> C) viram flowchart. Exige 2+ setas.", "detectFlows");
        containerEl.createEl("h3", { text: "Assistente de IA (opcional)" });
        const p = containerEl.createEl("p", {
            text: "Com um serviço de IA ligado, o plugin envia o texto de cada seção (e, se ativado, as figuras) ao serviço escolhido para gerar resumo, fluxo Mermaid e links melhores. " +
                "Isso sai do seu computador e pode gerar custo/uso de cota. O serviço “GitHub Models” usa um token da sua conta GitHub (permissão models:read).",
        });
        p.style.fontSize = "0.85em";
        p.style.opacity = "0.8";
        new obsidian_1.Setting(containerEl)
            .setName("Serviço de IA")
            .addDropdown((d) => {
            for (const k of Object.keys(AI_PRESETS))
                d.addOption(k, AI_PRESETS[k].label);
            d.setValue(AI_PRESETS[s.aiPreset] ? s.aiPreset : "off").onChange(async (v) => {
                s.aiPreset = v;
                const pr = AI_PRESETS[v];
                if (pr && v !== "off" && v !== "custom") {
                    s.aiBaseUrl = pr.baseUrl;
                    s.aiModel = pr.model;
                }
                await this.plugin.saveSettings();
                this.display();
            });
        });
        const kind = aiKindOf(s);
        if (kind !== "off") {
            if (kind === "cli") {
                new obsidian_1.Setting(containerEl)
                    .setName("Comando do Copilot CLI")
                    .setDesc("Precisa estar instalado e com login feito (rode `copilot` uma vez no terminal). Se o Obsidian não achar o comando, coloque o caminho completo. Cada chamada consome sua cota de requisições do Copilot.")
                    .addText((t) => t.setValue(s.aiCliCommand).onChange(async (v) => {
                    s.aiCliCommand = v.trim() || "copilot";
                    await this.plugin.saveSettings();
                }));
                new obsidian_1.Setting(containerEl)
                    .setName("Modelo (opcional)")
                    .setDesc("Deixe vazio para usar o padrão do Copilot CLI.")
                    .addText((t) => t.setValue(s.aiModel).onChange(async (v) => {
                    s.aiModel = v.trim();
                    await this.plugin.saveSettings();
                }));
            }
            else {
                new obsidian_1.Setting(containerEl)
                    .setName("Endereço da API")
                    .addText((t) => t.setValue(s.aiBaseUrl).onChange(async (v) => {
                    s.aiBaseUrl = v.trim();
                    await this.plugin.saveSettings();
                }));
                new obsidian_1.Setting(containerEl)
                    .setName("Modelo")
                    .setDesc(s.aiPreset === "github" ? "Formato publicador/modelo, ex.: openai/gpt-4.1" : "")
                    .addText((t) => t.setValue(s.aiModel).onChange(async (v) => {
                    s.aiModel = v.trim();
                    await this.plugin.saveSettings();
                }));
            }
            new obsidian_1.Setting(containerEl)
                .setName(kind === "cli" ? "Token GitHub (opcional)" : "Chave / token da API")
                .setDesc("Fica salvo em texto simples no data.json do plugin, dentro do vault. Não é necessário para Ollama local.")
                .addText((t) => {
                t.inputEl.type = "password";
                t.setValue(s.aiApiKey).onChange(async (v) => {
                    s.aiApiKey = v.trim();
                    await this.plugin.saveSettings();
                });
            });
            this.toggle(containerEl, "Resumo por seção", "Callout “Resumo” no topo da nota.", "aiSummary");
            this.toggle(containerEl, "Fluxo Mermaid a partir do texto", "Quando a seção descreve um processo ou sequência, adiciona um diagrama recolhido.", "aiFlow");
            this.toggle(containerEl, "Links melhores e “Veja também”", "A IA escolhe trechos do texto que se referem a outras seções.", "aiLinks");
            this.toggle(containerEl, "Revisar formatação do texto", "A IA reorganiza parágrafos, listas e tabelas sem alterar o conteúdo (resultados que mudam o conteúdo são descartados). Gasta mais.", "aiCleanup");
            if (kind !== "cli") {
                this.toggle(containerEl, "Figuras → Mermaid", "Envia cada imagem extraída; se for um diagrama, o Mermaid aparece abaixo da figura. Exige um modelo com visão.", "aiImages");
                this.num(containerEl, "Máximo de figuras analisadas", "", "aiMaxImages", 0, 30);
            }
            this.num(containerEl, "Máximo de seções enviadas à IA", "Limita custo/tempo por PDF.", "aiMaxSections", 0, 80);
            this.num(containerEl, "Máximo de caracteres por seção", "O que passar disso é cortado no envio.", "aiMaxSectionChars", 1000, 12000);
        }
    }
}
