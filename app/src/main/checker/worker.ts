import { parentPort, workerData } from 'node:worker_threads';
import { prepare, detectAll, type RawHit, type ChapterInput } from '../../shared/checker-core/detect';
import type { CheckParams } from '../../shared/types';

export interface WorkerReq {
  runId: number;
  chapters: ChapterInput[];
  params: CheckParams;
  /** 增量：只保留涉及该下标的命中；undefined = 全量 */
  focusIdx?: number;
}

export interface WorkerProgress { type: 'progress'; runId: number; done: number; total: number; }
export interface WorkerDone { type: 'done'; runId: number; hits: WorkerHit[]; }
export interface WorkerFail { type: 'error'; runId: number; message: string; }

export interface WorkerHit {
  chapterA: string; startA: number; endA: number;
  chapterB: string; startB: number; endB: number;
  similarity: number; kind: 'exact' | 'near';
}

const port = parentPort;
if (port) {
  port.on('message', (req: WorkerReq) => {
    try {
      const prepared = prepare(req.chapters, req.params);
      const raw: RawHit[] = detectAll(prepared, req.params, (done, total) => {
        const msg: WorkerProgress = { type: 'progress', runId: req.runId, done, total };
        port.postMessage(msg);
      });
      const hits: WorkerHit[] = [];
      for (const h of raw) {
        if (req.focusIdx !== undefined && h.aIdx !== req.focusIdx && h.bIdx !== req.focusIdx) continue;
        hits.push({
          chapterA: req.chapters[h.aIdx].id, startA: h.startA, endA: h.endA,
          chapterB: req.chapters[h.bIdx].id, startB: h.startB, endB: h.endB,
          similarity: h.similarity, kind: h.kind,
        });
      }
      const msg: WorkerDone = { type: 'done', runId: req.runId, hits };
      port.postMessage(msg);
    } catch (err) {
      const msg: WorkerFail = { type: 'error', runId: req.runId, message: err instanceof Error ? err.message : String(err) };
      port.postMessage(msg);
    }
  });
}
