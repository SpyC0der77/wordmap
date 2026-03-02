/**
 * Build word graph from Wiktionary definitions.
 * Downloads Simple English Wiktionary, tokenizes definitions with WinkNLP,
 * and outputs a graph where edges connect words that appear in each other's definitions.
 *
 * Run: bun run build-graph
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet } from "http";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from "d3-force";
import { TOP_WORDS } from "./frequency-list";

const BASE_DIST = 80;
const LAYOUT_TICKS = 500;

const WIKTIONARY_URL =
  "https://kaikki.org/dictionary/downloads/simple/simple-extract.jsonl.gz";
const RAW_DIR = path.join(process.cwd(), "data", "raw");
const OUTPUT_PATH = path.join(process.cwd(), "public", "data", "graph.json");

interface WiktionaryEntry {
  word: string;
  pos?: string;
  senses?: Array<{ glosses?: string[] }>;
}

interface GraphNode {
  id: string;
  pos: string;
  definitions: string[];
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function downloadWiktionary(): Promise<string> {
  await ensureDir(RAW_DIR);
  const gzPath = path.join(RAW_DIR, "simple-extract.jsonl.gz");
  const jsonlPath = path.join(RAW_DIR, "simple-extract.jsonl");

  if (fs.existsSync(jsonlPath)) {
    console.log("Using cached Wiktionary data:", jsonlPath);
    return jsonlPath;
  }

  if (!fs.existsSync(gzPath)) {
    console.log("Downloading Wiktionary (Simple English)...");
    const file = createWriteStream(gzPath);
    const url = new URL(WIKTIONARY_URL);
    const get = url.protocol === "https:" ? httpsGet : httpGet;
    await new Promise<void>((resolve, reject) => {
      get(WIKTIONARY_URL, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const redirect = res.headers.location;
          if (redirect) {
            get(redirect, (r2) =>
              r2.pipe(file).on("finish", resolve).on("error", reject),
            );
            return;
          }
        }
        res.pipe(file).on("finish", resolve).on("error", reject);
      }).on("error", reject);
    });
    file.close();
    console.log("Downloaded.");
  }

  console.log("Decompressing...");
  await pipeline(
    fs.createReadStream(gzPath),
    zlib.createGunzip(),
    createWriteStream(jsonlPath),
  );
  console.log("Done.");
  return jsonlPath;
}

function extractDefinitions(entry: WiktionaryEntry): string[] {
  const defs: string[] = [];
  for (const sense of entry.senses ?? []) {
    for (const g of sense.glosses ?? []) {
      if (typeof g === "string" && g.trim()) defs.push(g.trim());
    }
  }
  return defs;
}

function normalizePos(pos: string | undefined): string {
  if (!pos) return "other";
  const p = pos.toLowerCase();
  if (["noun", "n"].includes(p)) return "noun";
  if (["verb", "v"].includes(p)) return "verb";
  if (["adj", "adjective"].includes(p)) return "adjective";
  if (["adv", "adverb"].includes(p)) return "adverb";
  return p;
}

async function main(): Promise<void> {
  const winkNLP = (await import("wink-nlp")).default;
  const modelModule = await import("wink-eng-lite-web-model");
  const model = modelModule.default ?? modelModule;
  const nlp = winkNLP(model);
  const its = nlp.its;

  const jsonlPath = await downloadWiktionary();

  console.log("Loading entries and building vocabulary...");
  const entries = new Map<string, { pos: string; definitions: string[] }>();
  const lines = fs.readFileSync(jsonlPath, "utf-8").split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: WiktionaryEntry = JSON.parse(line);
      const word = entry.word?.toLowerCase();
      if (!word || !TOP_WORDS.has(word)) continue;

      const definitions = extractDefinitions(entry);
      if (definitions.length === 0) continue;

      const existing = entries.get(word);
      if (existing) {
        existing.definitions.push(...definitions);
        if (entry.pos) existing.pos = normalizePos(entry.pos);
      } else {
        entries.set(word, {
          pos: normalizePos(entry.pos),
          definitions,
        });
      }
    } catch {
      // skip malformed lines
    }
  }

  console.log(`Found ${entries.size} words in vocabulary with definitions.`);

  const vocabulary = new Set(entries.keys());
  const edgeCounts = new Map<string, number>();

  console.log("Tokenizing definitions and building edges...");
  let processed = 0;
  for (const [wordA, { definitions }] of entries) {
    processed++;
    if (processed % 200 === 0)
      process.stdout.write(`\r${processed}/${entries.size}`);

    const seenInDef = new Set<string>();
    for (const defText of definitions) {
      const doc = nlp.readDoc(defText);
      doc
        .tokens()
        .filter((t) => !t.out(its.stopWordFlag))
        .filter((t) => t.out(its.type) === "word")
        .each((token) => {
          let lemma: string;
          try {
            lemma = (token.out(its.lemma) as string)?.toLowerCase();
          } catch {
            lemma = (token.out(its.normal) as string)?.toLowerCase();
          }
          if (!lemma || lemma === wordA) return;
          if (!vocabulary.has(lemma)) return;
          if (seenInDef.has(lemma)) return;
          seenInDef.add(lemma);

          const key = [wordA, lemma].sort().join("|");
          edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
        });
    }
  }
  console.log("\nEdges built.");

  const maxWeight = Math.max(...edgeCounts.values(), 1);
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];

  for (const [word, { pos, definitions }] of entries) {
    nodes.push({
      id: word,
      pos,
      definitions: definitions.slice(0, 3),
    });
  }

  for (const [key, rawWeight] of edgeCounts) {
    const [source, target] = key.split("|");
    const weight = rawWeight / maxWeight;
    links.push({ source, target, weight });
  }

  console.log("Computing force-directed layout...");
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id((d: { id: string }) => d.id)
        .distance((link: GraphLink) =>
          BASE_DIST * (1 - 0.8 * (link.weight ?? 0)),
        )
        .strength((link: GraphLink) => 0.1 + 0.9 * (link.weight ?? 0)),
    )
    .force("charge", forceManyBody().strength(-100))
    .force("center", forceCenter(0, 0))
    .stop();

  for (let i = 0; i < LAYOUT_TICKS; i++) {
    simulation.tick();
    if (i % 100 === 0) process.stdout.write(`\r  Layout tick ${i}/${LAYOUT_TICKS}`);
  }
  console.log("\r  Layout complete.    ");

  const graph: GraphData = {
    nodes: nodes.map((n) => ({
      id: n.id,
      pos: n.pos,
      definitions: n.definitions,
      x: n.x ?? 0,
      y: n.y ?? 0,
    })),
    links,
  };
  await ensureDir(path.dirname(OUTPUT_PATH));
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(graph, null, 0), "utf-8");
  console.log(
    `Wrote ${nodes.length} nodes, ${links.length} links to ${OUTPUT_PATH}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
