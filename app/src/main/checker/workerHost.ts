import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import type { WebContents } from 'electron';
import { getDb } from '../services/bookService';
import * as chapterRepo from '../db/repositories/chapterRepo';
import * as checkRepo from '../db/repositories/checkRepo';
import { scoreChapters, hitSig, type ScoreRules, type HitLike } from '../../shared/checker-core/score';
import type { CheckParams, CheckProgress } from '../../shared/types';
import type { WorkerReq, WorkerDone, WorkerProgress, WorkerHit, WorkerFail } from './worker';

interface ActiveRun {
  bookId: string;
  runId: number;
  worker: Worker;
  scope: 'all' | { chapterId: string };
  texts: Map<string, string>;
}

export class CheckerHost {
  private active: ActiveRun | null = null;

  constructor(private send: (channel: string, payload: unknown) => void) {}

  cancel(bookId?: string): void {
    if (this.active && (!bookId || this.active.bookId === bookId)) {
      this.active.worker.terminate();
      this.active = null;
    }
  }

  isBusy(bookId?: string): boolean {
    return !!this.active && (!bookId || this.active.bookId === bookId);
  }

  /** 全量 / 单章增量查重。返回未忽略命中数。 */
  async run(bookId: string, full: boolean, focusChapterId?: string): Promise<{ hitCount: number }> {
    this.cancel(bookId);
    const db = getDb(bookId);
    const params = checkRepo.getParams(db.conn);
    const texts = chapterRepo.listChapterTexts(db.conn, bookId);
    if (texts.length === 0) return { hitCount: 0 };

    let focusIdx: number | undefined;
    if (!full && focusChapterId) {
      focusIdx = texts.findIndex(t => t.id === focusChapterId);
      if (focusIdx === undefined || focusIdx < 0) focusIdx = undefined;
    }
    const scope: 'all' | { chapterId: string } = full || focusIdx === undefined
      ? 'all'
      : { chapterId: texts[focusIdx].id };

    const dbRunId = checkRepo.createRun(db.conn, bookId, full ? 'full' : 'chapter', params);
    const worker = new Worker(path.join(__dirname, 'worker.js'));
    const active: ActiveRun = { bookId, runId: dbRunId, worker, scope, texts: new Map(texts.map(t => [t.id, t.text])) };
    this.active = active;

    const req: WorkerReq = { runId: dbRunId, chapters: texts, params, focusIdx };
    const hits = await new Promise<WorkerHit[]>((resolve, reject) => {
      worker.on('message', (msg: WorkerProgress | WorkerDone | WorkerFail) => {
        if (msg.type === 'progress') {
          const p: CheckProgress = { phase: 'indexing', done: msg.done, total: msg.total };
          this.send('check:progress', p);
        } else if (msg.type === 'done') {
          resolve(msg.hits);
        } else {
          reject(new Error(msg.message));
        }
      });
      worker.on('error', reject);
      worker.on('exit', code => { if (code !== 0) reject(new Error('checker worker exited with ' + code)); });
      worker.postMessage(req);
    }).finally(() => { worker.terminate(); if (this.active === active) this.active = null; });

    // 写库：命中 + 忽略继承 + 分级
    const newHits = hits.map(h => ({
      ...h,
      sig: hitSig(
        h.chapterA, active.texts.get(h.chapterA) ?? '', h.startA, h.endA,
        h.chapterB, active.texts.get(h.chapterB) ?? '', h.startB, h.endB,
      ),
    }));
    checkRepo.replaceHits(db.conn, bookId, dbRunId, scope, newHits);
    checkRepo.finishRun(db.conn, dbRunId);

    const allHits = checkRepo.getHits(db.conn, bookId);
    const rules: ScoreRules = {
      minFragLen: params.minFragLen,
      badFragLen: 100,
      flagBadRatio: params.flagBadRatio,
      flagWarnRatio: params.flagWarnRatio,
    };
    const scoreInputs = texts.map(t => ({ id: t.id, textLength: t.text.length }));
    // 命中存的是章节 id，评分需要下标：建立 id -> 下标 映射（命中可能来自历史 run，越界跳过）
    const idxOf = new Map(texts.map((t, i) => [t.id, i]));
    const hitLikes: HitLike[] = [];
    for (const h of allHits) {
      const aIdx = idxOf.get(h.chapterA);
      const bIdx = idxOf.get(h.chapterB);
      if (aIdx === undefined || bIdx === undefined) continue;
      hitLikes.push({ aIdx, bIdx, startA: h.startA, endA: h.endA, startB: h.startB, endB: h.endB });
    }
    const scores = scoreChapters(scoreInputs, hitLikes, rules);
    const flagged = scores
      .map((score, i) => ({ score, chapterId: texts[i].id }))
      .filter(x => x.score.level);
    checkRepo.setFlags(db.conn, flagged.map(x => ({
      chapterId: x.chapterId, level: x.score.level as 'warn' | 'bad',
      dupCount: x.score.dupCount, dupRatio: x.score.dupRatio,
    })));

    const hitCount = allHits.filter(h => !h.ignored).length;
    this.send('check:done', { hitCount });
    this.send('book:changed', { bookId });
    return { hitCount };
  }
}
