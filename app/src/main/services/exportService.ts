import * as fs from 'node:fs';
import type { ExportRequest, ExportResult } from '../../shared/types';
import { getDb, readLibrary } from './bookService';
import * as volumeRepo from '../db/repositories/volumeRepo';
import * as chapterRepo from '../db/repositories/chapterRepo';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

interface Section { title: string; body?: string; isVolume?: boolean; }
interface Doc { title: string; author: string; sections: Section[]; }

function buildDoc(bookId: string, request: ExportRequest): Doc {
  const entry = readLibrary().find(e => e.id === bookId);
  if (!entry) throw new Error('book not found');
  const db = getDb(bookId);
  const volumes = volumeRepo.listVolumes(db.conn, bookId);
  const chapters = chapterRepo.listChapterMeta(db.conn, bookId);
  const chapterText = (id: string) => chapterRepo.getChapter(db.conn, id).contentText;

  const sections: Section[] = [];
  if (request.scope === 'chapter') {
    const ch = chapters.find(c => c.id === request.targetId);
    if (!ch) throw new Error('chapter not found');
    sections.push({ title: ch.title, body: chapterText(ch.id) });
  } else if (request.scope === 'volume') {
    for (const v of volumes) {
      if (v.id !== request.targetId) continue;
      sections.push({ title: v.title, isVolume: true });
      for (const ch of chapters.filter(c => c.volumeId === v.id)) {
        sections.push({ title: ch.title, body: chapterText(ch.id) });
      }
    }
  } else {
    for (const v of volumes) {
      sections.push({ title: v.title, isVolume: true });
      for (const ch of chapters.filter(c => c.volumeId === v.id)) {
        sections.push({ title: ch.title, body: chapterText(ch.id) });
      }
    }
  }
  return { title: entry.title, author: entry.author, sections };
}

function renderTxt(doc: Doc): string {
  const out: string[] = [doc.title, doc.author ? '作者：' + doc.author : '', ''];
  for (const s of doc.sections) {
    if (s.isVolume) out.push('', s.title, '');
    else out.push('', s.title, '');
    if (s.body) { out.push(s.body, ''); }
  }
  return out.join('\n');
}

function renderMd(doc: Doc): string {
  const out: string[] = ['# ' + doc.title];
  if (doc.author) out.push('', '> 作者：' + doc.author, '');
  for (const s of doc.sections) {
    if (s.isVolume) out.push('', '---', '', '## ' + s.title, '');
    else out.push('', '### ' + s.title, '', s.body ?? '', '');
  }
  return out.join('\n') + '\n';
}

async function renderDocx(doc: Doc): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.title, bold: true, size: 48 })] }),
  ];
  if (doc.author) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '作者：' + doc.author, size: 24 })] }));
  }
  children.push(new Paragraph({ children: [] }));
  for (const s of doc.sections) {
    if (s.isVolume) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: s.title, bold: true })] }));
    } else {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s.title, bold: true })] }));
      for (const line of (s.body ?? '').split('\n')) {
        children.push(new Paragraph({
          children: [new TextRun(line)],
          indent: { firstLine: 480 },
          spacing: { after: 120 },
        }));
      }
    }
  }
  const file = new Document({ sections: [{ children }] });
  return Packer.toBuffer(file);
}

export async function runExport(bookId: string, request: ExportRequest, savePath?: string): Promise<ExportResult> {
  const doc = buildDoc(bookId, request);
  if (savePath === undefined) return { canceled: true };
  if (request.format === 'txt') fs.writeFileSync(savePath, renderTxt(doc), 'utf8');
  else if (request.format === 'md') fs.writeFileSync(savePath, renderMd(doc), 'utf8');
  else fs.writeFileSync(savePath, await renderDocx(doc));
  return { canceled: false, filePath: savePath };
}

export function exportPreviewText(bookId: string, request: ExportRequest): string {
  const doc = buildDoc(bookId, request);
  return request.format === 'md' ? renderMd(doc) : renderTxt(doc);
}
