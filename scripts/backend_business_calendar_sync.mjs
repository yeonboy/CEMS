/*
  Backend Business-Calendar Sync (OOP)

  - Reads db/calendar_schedules.json (saved calendar HTML + meta)
  - Extracts items for team "대기질 조사" from October (month>=10)
  - Matches calendar project titles to business DB (db/business_contracts_q4_2025.json)
  - Emits overlay file: db/backend_business_calendar_sync.json

  Reserved-file safe per backend role rules: outputs backend_*.json
*/

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

class FileSystemHelper {
  constructor(projectRoot){ this.projectRoot = projectRoot; }
  resolveDb(name){ return path.join(this.projectRoot, 'db', name); }
  async readJson(name, fallback){
    try { return JSON.parse(await fsp.readFile(this.resolveDb(name), 'utf8')); }
    catch { return fallback; }
  }
  async writeJson(name, data){
    const p = this.resolveDb(name);
    await fsp.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
    return p;
  }
}

class Normalizer {
  static normalizeTitle(raw){
    return String(raw||'')
      .toLowerCase()
      .replace(/[\s\t\n\r]+/g,'')
      .replace(/[\-_/.,()\[\]{}<>~!@#$%^&*`'"|\\:;]+/g,'')
      .trim();
  }
  static tokenize(raw){
    return String(raw||'')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu,' ')
      .split(/\s+/)
      .filter(Boolean);
  }
}

class BusinessDB {
  constructor(rows){
    this.rows = Array.isArray(rows) ? rows : [];
    this.indexByNorm = new Map();
    for (const r of this.rows){
      const key = Normalizer.normalizeTitle(r.projectName||'');
      if (key) this.indexByNorm.set(key, r);
    }
  }
  matchByTitle(title){
    if (!title) return null;
    const norm = Normalizer.normalizeTitle(title);
    if (!norm) return null;
    const exact = this.indexByNorm.get(norm);
    if (exact) return exact;
    // loose match: token overlap
    const toks = new Set(Normalizer.tokenize(title));
    let best = null, bestScore = 0;
    for (const r of this.rows){
      const toks2 = new Set(Normalizer.tokenize(r.projectName||''));
      if (!toks2.size) continue;
      let inter = 0;
      toks.forEach(t=>{ if (toks2.has(t)) inter++; });
      const score = inter / Math.max(toks.size, toks2.size);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore >= 0.6 ? best : null; // threshold
  }
}

class CalendarHtmlParser {
  constructor(html, meta){ this.html = String(html||''); this.meta = meta||{}; }
  // very lightweight parser tailored to our generated HTML
  parseTeamEntries(targetTeam){
    const year = Number(this.meta?.year)||new Date().getFullYear();
    const month = Number(this.meta?.month)||0;
    const out = [];
    const rows = this.html.split(/<tr[\s\S]*?>/i).slice(1).map(s=>s.split(/<\/tr>/i)[0]);
    let currentTeam = '';
    for (const row of rows){
      // team cell if present
      const teamMatch = row.match(/<td[^>]*class=\"team-cell\"[^>]*>([\s\S]*?)<\/td>/i);
      if (teamMatch){ currentTeam = CalendarHtmlParser._stripText(teamMatch[1]); }
      if (!currentTeam) continue;
      if (targetTeam && currentTeam !== targetTeam) continue;
      // event cells
      const cellRegex = /<td[^>]*class=\"event-cell[^"]*\"[^>]*data-day=\"(\d+)\"[^>]*>([\s\S]*?)<\/td>/ig;
      let m;
      while ((m = cellRegex.exec(row))){
        const day = Number(m[1]);
        const txt = CalendarHtmlParser._stripText(m[2]).trim();
        if (!txt) continue;
        const titles = txt.split(/\n+/).map(s=>s.trim()).filter(Boolean);
        if (!titles.length) continue;
        const date = new Date(year, (month>0?month:1)-1, day);
        titles.forEach(t=> out.push({ title: t, day, dateStr: date.toISOString().slice(0,10), team: currentTeam }));
      }
    }
    return out;
  }
  static _stripText(s){
    return String(s||'')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g,' ')
      .replace(/&amp;/g,'&')
      .trim();
  }
}

class CalendarToBusinessSync {
  constructor(bizDb){ this.bizDb = bizDb; }
  buildOverlay(calendarItems){
    const items = [];
    for (const it of (calendarItems||[])){
      const meta = it?.meta || {}; // { year, month, weekIndex }
      const month = Number(meta.month||0);
      if (month && month < 10) continue; // only October+
      const parser = new CalendarHtmlParser(it.html || '', meta);
      const entries = parser.parseTeamEntries('대기질 조사');
      if (!entries.length) continue;
      // group by title to pick last date within this calendar
      const byTitle = new Map();
      for (const e of entries){
        const k = e.title;
        const prev = byTitle.get(k);
        if (!prev || (e.dateStr > prev.dateStr)) byTitle.set(k, e);
      }
      for (const [title, last] of byTitle){
        const match = this.bizDb.matchByTitle(title);
        items.push({
          businessId: match?.projectId || null,
          projectTitle: title,
          completedAt: last.dateStr,
          team: '대기질 조사',
          sourceCalendarId: it.id || null,
          weekKey: it.weekKey || null,
          year: meta.year || null,
          month: month || null,
          weekIndex: meta.weekIndex || null,
          complete: true
        });
      }
    }
    const now = new Date().toISOString();
    return { _meta: { generatedAt: now, schemaVersion: 1 }, items };
  }
}

async function main(){
  const PROJECT_ROOT = process.cwd();
  const fsx = new FileSystemHelper(PROJECT_ROOT);
  const calendars = await fsx.readJson('calendar_schedules.json', []);
  const bizPayload = await fsx.readJson('business_contracts_q4_2025.json', { data: [] });
  const bizRows = Array.isArray(bizPayload?.data) ? bizPayload.data : [];
  const bizDb = new BusinessDB(bizRows);
  const sync = new CalendarToBusinessSync(bizDb);
  const overlay = sync.buildOverlay(calendars);
  const outFile = await fsx.writeJson('backend_business_calendar_sync.json', overlay);
  // eslint-disable-next-line no-console
  console.log('Wrote overlay:', outFile, 'items:', overlay.items.length);
}

if (import.meta.main){
  main().catch(err=>{ console.error(err); process.exit(1); });
}


