/**
 * Build word graph from GloVe embeddings.
 * Downloads GloVe 6B vectors, builds edges via cosine similarity KNN,
 * uses UMAP for 2D layout, and optionally loads Wiktionary for definitions/POS.
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
import { spawn } from "child_process";
import { UMAP } from "umap-js";
import { TOP_WORDS } from "./frequency-list";

const K_NEIGHBORS = 10;
const GLOVE_DIMS = 100;

const GLOVE_URL = "https://nlp.stanford.edu/data/glove.6B.zip";
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

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const urlObj = new URL(url);
    const get = urlObj.protocol === "https:" ? httpsGet : httpGet;
    get(url, (res) => {
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
}

async function downloadAndExtractGlove(): Promise<string> {
  await ensureDir(RAW_DIR);
  const zipPath = path.join(RAW_DIR, "glove.6B.zip");
  const txtPath = path.join(RAW_DIR, "glove.6B.100d.txt");

  if (fs.existsSync(txtPath)) {
    console.log("Using cached GloVe vectors:", txtPath);
    return txtPath;
  }

  if (!fs.existsSync(zipPath)) {
    console.log("Downloading GloVe 6B (~822MB)...");
    await downloadFile(GLOVE_URL, zipPath);
    console.log("Downloaded.");
  }

  console.log("Extracting glove.6B.100d.txt...");
  await new Promise<void>((resolve, reject) => {
    const unzip = spawn(
      "unzip",
      ["-o", zipPath, "glove.6B.100d.txt", "-d", RAW_DIR],
      {
        stdio: "pipe",
      },
    );
    unzip.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exited with code ${code}`));
    });
    unzip.on("error", reject);
  });
  console.log("Extracted.");
  return txtPath;
}

function loadGloveVectors(
  txtPath: string,
  vocabulary: Set<string>,
): Map<string, number[]> {
  const vectors = new Map<string, number[]>();
  const content = fs.readFileSync(txtPath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(" ");
    const word = parts[0]?.toLowerCase();
    if (!word || !vocabulary.has(word)) continue;

    const vec: number[] = [];
    for (let i = 1; i < parts.length; i++) {
      const v = parseFloat(parts[i]!);
      if (!Number.isNaN(v)) vec.push(v);
    }
    if (vec.length === GLOVE_DIMS) vectors.set(word, vec);
  }
  return vectors;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function buildKnnEdges(
  words: string[],
  vectors: Map<string, number[]>,
  k: number,
): GraphLink[] {
  const links: GraphLink[] = [];
  const vecs = words.map((w) => vectors.get(w)!);

  for (let i = 0; i < words.length; i++) {
    if (i % 500 === 0) process.stdout.write(`\r  KNN ${i}/${words.length}`);

    const wordA = words[i]!;
    const vecA = vecs[i]!;
    const candidates: { word: string; sim: number }[] = [];

    for (let j = 0; j < words.length; j++) {
      if (i === j) continue;
      const sim = cosineSimilarity(vecA, vecs[j]!);
      candidates.push({ word: words[j]!, sim });
    }

    candidates.sort((a, b) => b.sim - a.sim);
    for (let t = 0; t < Math.min(k, candidates.length); t++) {
      const { word: wordB, sim } = candidates[t]!;
      if (sim <= 0) continue;
      links.push({ source: wordA, target: wordB, weight: sim });
    }
  }
  console.log("\r  KNN complete.    ");

  const byKey = new Map<string, GraphLink>();
  for (const link of links) {
    const key = [link.source, link.target].sort().join("|");
    const existing = byKey.get(key);
    if (!existing || link.weight > existing.weight) {
      byKey.set(key, link);
    }
  }
  return [...byKey.values()];
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
    await downloadFile(WIKTIONARY_URL, gzPath);
    console.log("Downloaded.");
  }

  console.log("Decompressing Wiktionary...");
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

function loadWiktionaryMetadata(
  jsonlPath: string,
  words: Set<string>,
): Map<string, { pos: string; definitions: string[] }> {
  const metadata = new Map<string, { pos: string; definitions: string[] }>();
  const content = fs.readFileSync(jsonlPath, "utf-8");
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry: WiktionaryEntry = JSON.parse(line);
      const word = entry.word?.toLowerCase();
      if (!word || !words.has(word)) continue;

      const definitions = extractDefinitions(entry);
      const existing = metadata.get(word);
      if (existing) {
        existing.definitions.push(...definitions);
        if (entry.pos) existing.pos = normalizePos(entry.pos);
      } else {
        metadata.set(word, {
          pos: normalizePos(entry.pos),
          definitions,
        });
      }
    } catch {
      // skip malformed lines
    }
  }
  return metadata;
}

async function main(): Promise<void> {
  const vocabulary = new Set([...TOP_WORDS].map((w) => w.toLowerCase()));

  console.log("Loading GloVe vectors...");
  const glovePath = await downloadAndExtractGlove();
  const vectors = loadGloveVectors(glovePath, vocabulary);

  const words = [...vectors.keys()].sort();
  console.log(`Found ${words.length} words with GloVe vectors.`);

  if (words.length === 0) {
    throw new Error(
      "No vocabulary words found in GloVe. Check frequency-list.json.",
    );
  }

  console.log("Building KNN edges (cosine similarity)...");
  const links = buildKnnEdges(words, vectors, K_NEIGHBORS);

  console.log("Running UMAP for 2D layout...");
  const vecArray = words.map((w) => vectors.get(w)!);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: 15,
    nEpochs: 200,
    minDist: 5,
    spread: 1.0,
  });
  const embedding = umap.fit(vecArray);

  const wordsSet = new Set(words);
  let metadata = new Map<string, { pos: string; definitions: string[] }>();
  try {
    const jsonlPath = await downloadWiktionary();
    console.log("Loading Wiktionary metadata...");
    metadata = loadWiktionaryMetadata(jsonlPath, wordsSet);
  } catch (err) {
    console.warn(
      "Wiktionary unavailable; using default POS for all words:",
      err,
    );
  }

  const nodes: GraphNode[] = words.map((word, i) => {
    const meta = metadata.get(word);
    return {
      id: word,
      pos: meta?.pos ?? "other",
      definitions: (meta?.definitions ?? []).slice(0, 3),
      x: embedding[i]![0],
      y: embedding[i]![1],
    };
  });

  const graph: GraphData = { nodes, links };
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
