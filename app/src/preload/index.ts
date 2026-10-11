import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { INVOKE_CHANNELS, EVENT_CHANNELS, type IpcInvokeMap, type InvokeChannel, type EventChannel } from '../shared/ipc-contract';

type EventPayload<C extends EventChannel> =
  C extends 'check:progress' ? import('../shared/types').CheckProgress :
  C extends 'check:done' ? { hitCount: number } :
  C extends 'check:error' ? { message: string } :
  C extends 'book:changed' ? { bookId: string } : never;

const api = {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: IpcInvokeMap[C]['req'] extends void ? [] : [IpcInvokeMap[C]['req']]
  ): Promise<IpcInvokeMap[C]['res']> {
    if (!(INVOKE_CHANNELS as readonly string[]).includes(channel)) {
      return Promise.reject(new Error('channel not allowed: ' + channel));
    }
    return ipcRenderer.invoke(channel, ...(args as unknown[])) as Promise<IpcInvokeMap[C]['res']>;
  },
  on<C extends EventChannel>(channel: C, cb: (payload: EventPayload<C>) => void): () => void {
    if (!(EVENT_CHANNELS as readonly string[]).includes(channel)) {
      throw new Error('channel not allowed: ' + channel);
    }
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload as EventPayload<C>);
    ipcRenderer.on(channel, listener);
    return () => { ipcRenderer.removeListener(channel, listener); };
  },
};

export type NovelEditorApi = typeof api;

contextBridge.exposeInMainWorld('novelEditor', api);
