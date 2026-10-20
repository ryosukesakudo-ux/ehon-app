// 同じ設定で作った mp4（Veo の 720p・24fps・AAC）を、再エンコードせずに1本につなぐ（2026-10-20 止め絵方式のスタジオ用）。
// Vercel の関数には ffmpeg が無いので、mp4 の箱（box）を読んで moov を作り直し、mdat を並べるだけにしている。
// 条件: 全部のファイルで トラック数・時間の単位（timescale）・コーデック設定（stsd）が同じこと。違えばエラーにする。
// 参照: ISO/IEC 14496-12（ISO base media file format）

type Box = { type: string; start: number; size: number; body: number; end: number };

function readBoxes(buf: Buffer, start: number, end: number): Box[] {
  const out: Box[] = [];
  let off = start;
  while (off + 8 <= end) {
    let size = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    let body = off + 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(off + 8));
      body = off + 16;
    } else if (size === 0) size = end - off;
    if (size < 8 || off + size > end) throw new Error(`mp4 の箱が壊れています (${type})`);
    out.push({ type, start: off, size, body, end: off + size });
    off += size;
  }
  return out;
}

const child = (buf: Buffer, b: Box, type: string) => readBoxes(buf, b.body, b.end).find((x) => x.type === type);
const slice = (buf: Buffer, b: Box) => buf.subarray(b.start, b.end);

type Track = {
  tkhd: Buffer;
  elst: Buffer | null;
  mdhd: Buffer;
  hdlr: Buffer;
  /** vmhd/smhd と dinf（そのままコピー） */
  minfHead: Buffer[];
  stsd: Buffer;
  stts: { count: number; delta: number }[];
  stss: number[] | null;
  ctts: { version: number; entries: { count: number; offset: number }[] } | null;
  stsc: { firstChunk: number; samples: number; desc: number }[];
  stsz: { constant: number; sizes: number[]; count: number };
  offsets: number[];
  sgpd: Buffer | null;
  sbgp: { head: Buffer; entries: { count: number; index: number }[] } | null;
  movieDuration: number;
  mediaDuration: number;
  mediaTimescale: number;
};

type Parsed = { ftyp: Buffer; mvhd: Buffer; movieTimescale: number; movieDuration: number; tracks: Track[]; moovRest: Buffer[]; mdatBody: number; mdatEnd: number; buf: Buffer };

function parse(buf: Buffer): Parsed {
  const top = readBoxes(buf, 0, buf.length);
  const ftyp = top.find((b) => b.type === "ftyp");
  const moov = top.find((b) => b.type === "moov");
  const mdats = top.filter((b) => b.type === "mdat");
  if (!ftyp || !moov || mdats.length !== 1) throw new Error("mp4 の形が想定と違います（ftyp / moov / mdat が1つずつ必要）");
  const mdat = mdats[0];
  const mvhd = child(buf, moov, "mvhd");
  if (!mvhd) throw new Error("mvhd がありません");
  const mv = fullBoxFields(buf, mvhd);
  const tracks: Track[] = [];
  const moovRest: Buffer[] = [];
  for (const b of readBoxes(buf, moov.body, moov.end)) {
    if (b.type === "mvhd") continue;
    if (b.type !== "trak") {
      moovRest.push(slice(buf, b));
      continue;
    }
    tracks.push(parseTrack(buf, b));
  }
  return { ftyp: slice(buf, ftyp), mvhd: slice(buf, mvhd), movieTimescale: mv.timescale, movieDuration: mv.duration, tracks, moovRest, mdatBody: mdat.body, mdatEnd: mdat.end, buf };
}

/** mvhd / mdhd の timescale と duration（版0と版1で場所が違う） */
function fullBoxFields(buf: Buffer, b: Box) {
  const version = buf[b.body];
  if (version === 1) return { version, timescale: buf.readUInt32BE(b.body + 20), duration: Number(buf.readBigUInt64BE(b.body + 24)) };
  return { version, timescale: buf.readUInt32BE(b.body + 12), duration: buf.readUInt32BE(b.body + 16) };
}

function parseTrack(buf: Buffer, trak: Box): Track {
  const tkhd = child(buf, trak, "tkhd");
  const mdia = child(buf, trak, "mdia");
  if (!tkhd || !mdia) throw new Error("trak の中身が足りません");
  const edts = child(buf, trak, "edts");
  const elst = edts ? child(buf, edts, "elst") : undefined;
  const mdhd = child(buf, mdia, "mdhd");
  const hdlr = child(buf, mdia, "hdlr");
  const minf = child(buf, mdia, "minf");
  if (!mdhd || !hdlr || !minf) throw new Error("mdia の中身が足りません");
  const stbl = child(buf, minf, "stbl");
  if (!stbl) throw new Error("stbl がありません");
  const minfHead = readBoxes(buf, minf.body, minf.end).filter((b) => b.type !== "stbl").map((b) => slice(buf, b));
  const s = Object.fromEntries(readBoxes(buf, stbl.body, stbl.end).map((b) => [b.type, b])) as Record<string, Box | undefined>;
  if (!s.stsd || !s.stts || !s.stsc || !s.stsz || !(s.stco || s.co64)) throw new Error("stbl の中身が足りません");
  const md = fullBoxFields(buf, mdhd);
  const tkVersion = buf[tkhd.body];
  const movieDuration = tkVersion === 1 ? Number(buf.readBigUInt64BE(tkhd.body + 28)) : buf.readUInt32BE(tkhd.body + 20);

  const entries = (b: Box) => buf.readUInt32BE(b.body + 4);
  const stts = Array.from({ length: entries(s.stts) }, (_, i) => ({ count: buf.readUInt32BE(s.stts!.body + 8 + i * 8), delta: buf.readUInt32BE(s.stts!.body + 12 + i * 8) }));
  const stss = s.stss ? Array.from({ length: entries(s.stss) }, (_, i) => buf.readUInt32BE(s.stss!.body + 8 + i * 4)) : null;
  const ctts = s.ctts
    ? {
        version: buf[s.ctts.body],
        entries: Array.from({ length: entries(s.ctts) }, (_, i) => ({ count: buf.readUInt32BE(s.ctts!.body + 8 + i * 8), offset: buf[s.ctts!.body] === 1 ? buf.readInt32BE(s.ctts!.body + 12 + i * 8) : buf.readUInt32BE(s.ctts!.body + 12 + i * 8) })),
      }
    : null;
  const stsc = Array.from({ length: entries(s.stsc) }, (_, i) => ({ firstChunk: buf.readUInt32BE(s.stsc!.body + 8 + i * 12), samples: buf.readUInt32BE(s.stsc!.body + 12 + i * 12), desc: buf.readUInt32BE(s.stsc!.body + 16 + i * 12) }));
  const constant = buf.readUInt32BE(s.stsz.body + 4);
  const count = buf.readUInt32BE(s.stsz.body + 8);
  const sizes = constant === 0 ? Array.from({ length: count }, (_, i) => buf.readUInt32BE(s.stsz!.body + 12 + i * 4)) : [];
  const co = s.stco ?? s.co64!;
  const offsets = Array.from({ length: entries(co) }, (_, i) => (s.stco ? buf.readUInt32BE(co.body + 8 + i * 4) : Number(buf.readBigUInt64BE(co.body + 8 + i * 8))));
  // sbgp は 版/フラグ・grouping_type（版1なら parameter も）の後に件数が来る
  const sbgpHead = s.sbgp ? (buf[s.sbgp.body] === 1 ? 12 : 8) : 0;
  const sbgp = s.sbgp
    ? { head: buf.subarray(s.sbgp.body, s.sbgp.body + sbgpHead), entries: Array.from({ length: buf.readUInt32BE(s.sbgp.body + sbgpHead) }, (_, i) => ({ count: buf.readUInt32BE(s.sbgp!.body + sbgpHead + 4 + i * 8), index: buf.readUInt32BE(s.sbgp!.body + sbgpHead + 8 + i * 8) })) }
    : null;
  return {
    tkhd: slice(buf, tkhd),
    elst: elst ? slice(buf, elst) : null,
    mdhd: slice(buf, mdhd),
    hdlr: slice(buf, hdlr),
    minfHead,
    stsd: slice(buf, s.stsd),
    stts,
    stss,
    ctts,
    stsc,
    stsz: { constant, sizes, count },
    offsets,
    sgpd: s.sgpd ? slice(buf, s.sgpd) : null,
    sbgp,
    movieDuration,
    mediaDuration: md.duration,
    mediaTimescale: md.timescale,
  };
}

// ---------- 書く ----------

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}
function box(type: string, ...parts: Buffer[]) {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  return Buffer.concat([u32(size), Buffer.from(type, "latin1"), ...parts]);
}
function fullBox(type: string, version: number, parts: Buffer[]) {
  const vf = Buffer.alloc(4);
  vf[0] = version;
  return box(type, vf, ...parts);
}
function table(type: string, version: number, rows: number[][]) {
  const body = Buffer.alloc(4 + rows.length * (rows[0]?.length ?? 1) * 4);
  body.writeUInt32BE(rows.length, 0);
  let off = 4;
  for (const r of rows) for (const v of r) {
    if (v < 0) body.writeInt32BE(v, off);
    else body.writeUInt32BE(v, off);
    off += 4;
  }
  return fullBox(type, version, [body]);
}

/** 箱をコピーして duration だけ書き換える（mvhd / tkhd / mdhd。版0は32bit、版1は64bit） */
function withDuration(src: Buffer, offsetV0: number, offsetV1: number, duration: number) {
  const b = Buffer.from(src);
  if (b[8] === 1) b.writeBigUInt64BE(BigInt(duration), 8 + offsetV1);
  else b.writeUInt32BE(duration, 8 + offsetV0);
  return b;
}

/** elst（編集リスト）の segment_duration を書き換える。項目が1つのときだけ（Veo の出力はそう） */
function withElstDuration(src: Buffer, duration: number) {
  const b = Buffer.from(src);
  const count = b.readUInt32BE(12);
  if (count !== 1) throw new Error("編集リストの項目が複数あるため、つなげません");
  if (b[8] === 1) b.writeBigUInt64BE(BigInt(duration), 16);
  else b.writeUInt32BE(duration, 16);
  return b;
}

/**
 * 複数の mp4 を順につないで1本にする。1本だけならそのまま返す。
 * 全部のファイルで、トラック数・timescale・コーデック設定（stsd）が同じでないとエラー。
 */
export function concatMp4(files: Buffer[]): Buffer {
  if (files.length === 0) throw new Error("つなぐ動画がありません");
  if (files.length === 1) return files[0];
  const parsed = files.map(parse);
  const first = parsed[0];
  for (const p of parsed.slice(1)) {
    if (p.tracks.length !== first.tracks.length) throw new Error("動画のトラック数が違うため、つなげません");
    if (p.movieTimescale !== first.movieTimescale) throw new Error("動画の時間の単位が違うため、つなげません");
    p.tracks.forEach((t, i) => {
      const f = first.tracks[i];
      if (!t.stsd.equals(f.stsd)) throw new Error(`動画の形式（コーデック設定）が違うため、つなげません（トラック${i + 1}）`);
      if (t.mediaTimescale !== f.mediaTimescale) throw new Error(`時間の単位が違うため、つなげません（トラック${i + 1}）`);
      if (Boolean(t.stss) !== Boolean(f.stss) || Boolean(t.sbgp) !== Boolean(f.sbgp)) throw new Error(`サンプル表の種類が違うため、つなげません（トラック${i + 1}）`);
      if (t.ctts && f.ctts && t.ctts.version !== f.ctts.version) throw new Error(`ctts の版が違うため、つなげません（トラック${i + 1}）`);
    });
  }

  // mdat の中身を順に並べる。各ファイルの先頭が出力の mdat の中でどこから始まるか
  const mdatParts = parsed.map((p) => p.buf.subarray(p.mdatBody, p.mdatEnd));
  const mdatOffsets: number[] = [];
  let acc = 0;
  for (const part of mdatParts) {
    mdatOffsets.push(acc);
    acc += part.length;
  }
  const mdatSize = acc;
  const mdatHeaderSize = mdatSize + 8 > 0xffffffff ? 16 : 8;

  const movieDuration = parsed.reduce((n, p) => n + p.movieDuration, 0);

  const buildMoov = (mdatDataStart: number) => {
    const traks = first.tracks.map((_, ti) => {
      const ts = parsed.map((p) => p.tracks[ti]);
      const f = ts[0];
      // stts: 続けて並べ、隣り合う同じ delta はまとめる
      const stts: { count: number; delta: number }[] = [];
      for (const t of ts) for (const e of t.stts) {
        const last = stts[stts.length - 1];
        if (last && last.delta === e.delta) last.count += e.count;
        else stts.push({ ...e });
      }
      // サンプル番号・チャンク番号は前のファイルの分だけずらす
      const stss: number[] = [];
      const ctts: { count: number; offset: number }[] = [];
      const stsc: number[][] = [];
      const sizes: number[] = [];
      const offsets: number[] = [];
      const sbgp: number[][] = [];
      let sampleBase = 0;
      let chunkBase = 0;
      const allConstant = ts.every((t) => t.stsz.constant !== 0 && t.stsz.constant === f.stsz.constant);
      ts.forEach((t, fi) => {
        if (t.stss) for (const n of t.stss) stss.push(n + sampleBase);
        if (t.ctts) for (const e of t.ctts.entries) ctts.push(e);
        else if (f.ctts) ctts.push({ count: t.stsz.count, offset: 0 });
        for (const e of t.stsc) {
          if (e.desc !== 1) throw new Error("サンプルの説明が複数あるため、つなげません");
          stsc.push([e.firstChunk + chunkBase, e.samples, 1]);
        }
        if (!allConstant) for (let i = 0; i < t.stsz.count; i++) sizes.push(t.stsz.constant || t.stsz.sizes[i]);
        const p = parsed[fi];
        for (const o of t.offsets) {
          if (o < p.mdatBody || o >= p.mdatEnd) throw new Error("mdat の外にデータがあるため、つなげません");
          offsets.push(mdatDataStart + mdatOffsets[fi] + (o - p.mdatBody));
        }
        if (t.sbgp) for (const e of t.sbgp.entries) sbgp.push([e.count, e.index]);
        sampleBase += t.stsz.count;
        chunkBase += t.offsets.length;
      });
      if (offsets.some((o) => o > 0xffffffff)) throw new Error("動画が大きすぎてつなげません（4GB超）");
      const useSgpd = f.sgpd && ts.every((t) => t.sgpd && t.sgpd.equals(f.sgpd!));
      const stbl = box(
        "stbl",
        f.stsd,
        table("stts", 0, stts.map((e) => [e.count, e.delta])),
        ...(f.stss ? [table("stss", 0, stss.map((n) => [n]))] : []),
        ...(f.ctts ? [table("ctts", f.ctts.version, ctts.map((e) => [e.count, e.offset]))] : []),
        table("stsc", 0, stsc),
        allConstant
          ? fullBox("stsz", 0, [u32(f.stsz.constant), u32(sampleBase)])
          : fullBox("stsz", 0, [u32(0), u32(sizes.length), Buffer.concat(sizes.map(u32))]),
        table("stco", 0, offsets.map((o) => [o])),
        ...(useSgpd ? [f.sgpd!] : []),
        ...(useSgpd && f.sbgp ? [fullBox("sbgp", f.sbgp.head[0], [f.sbgp.head.subarray(4), u32(sbgp.length), Buffer.concat(sbgp.flat().map(u32))])] : []),
      );
      const mediaDuration = ts.reduce((n, t) => n + t.mediaDuration, 0);
      const trackDuration = ts.reduce((n, t) => n + t.movieDuration, 0);
      const mdia = box("mdia", withDuration(f.mdhd, 16, 24, mediaDuration), f.hdlr, box("minf", ...f.minfHead, stbl));
      return box("trak", withDuration(f.tkhd, 20, 28, trackDuration), ...(f.elst ? [box("edts", withElstDuration(f.elst, trackDuration))] : []), mdia);
    });
    return box("moov", withDuration(first.mvhd, 16, 24, movieDuration), ...traks, ...first.moovRest);
  };

  // moov の大きさは中のオフセットの値に関係なく決まるので、いったん作って長さを測り、正しい位置で作り直す
  const moovSize = buildMoov(0).length;
  const mdatDataStart = first.ftyp.length + moovSize + mdatHeaderSize;
  const moov = buildMoov(mdatDataStart);
  const mdatHeader = mdatHeaderSize === 16 ? Buffer.concat([u32(1), Buffer.from("mdat", "latin1"), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(mdatSize + 16)); return b; })()]) : Buffer.concat([u32(mdatSize + 8), Buffer.from("mdat", "latin1")]);
  return Buffer.concat([first.ftyp, moov, mdatHeader, ...mdatParts]);
}
