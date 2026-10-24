import assert from 'node:assert/strict';
import { File } from 'node:buffer';

globalThis.File = File;

const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
  callback,
  delay === 5000 ? 0 : delay,
  ...args
);

let databaseClosed = false;
const validTrack = {
  id: 'persistida',
  file: new File(['áudio'], 'persistida.mp3', { type: 'audio/mpeg' }),
  fileName: 'persistida.mp3',
  fileType: 'audio/mpeg',
  fileLastModified: 1,
  path: 'persistida.mp3',
  pathKey: 'persistida',
  title: 'João — Música 日本語',
  artist: 'Beyoncé',
  album: 'François',
  duration: 10,
  playCount: 0
};
const invalidTrack = {};
Object.defineProperty(invalidTrack, 'file', {
  enumerable: true,
  get() {
    throw new Error('registro corrompido');
  }
});

const database = {
  onversionchange: null,
  close() {
    databaseClosed = true;
  },
  transaction() {
    return {
      objectStore() {
        return {
          getAll() {
            const request = {};
            queueMicrotask(() => {
              request.result = [validTrack, invalidTrack];
              request.onsuccess?.();
            });
            return request;
          }
        };
      }
    };
  }
};

globalThis.indexedDB = {
  open() {
    const request = {};
    nativeSetTimeout(() => {
      request.result = database;
      request.onsuccess?.();
    }, 20);
    return request;
  }
};

const { default: Library } = await import('../js/library.js');

assert.equal(await Library.restore(), false, 'o primeiro restore deve encerrar de forma recuperável no timeout');
await new Promise(resolve => nativeSetTimeout(resolve, 30));
assert.equal(databaseClosed, false, 'uma conexão que chega depois do timeout deve ser reaproveitada, não fechada');

assert.equal(await Library.restore(), true, 'uma nova tentativa deve reutilizar a conexão tardia');
assert.equal(Library.getTracks().length, 1, 'um registro inválido não deve impedir a restauração dos válidos');
assert.equal(Library.getTracks()[0].title, 'João — Música 日本語');

const diagnosticCodes = Library.getDiagnostics().map(item => item.code);
assert.ok(diagnosticCodes.includes('persistence-timeout'));
assert.ok(diagnosticCodes.includes('track-restore-failed'));

let readAttempts = 0;
const readRetryDatabase = {
  close() {},
  transaction() {
    return {
      objectStore() {
        return {
          getAll() {
            readAttempts += 1;
            const request = {};
            if (readAttempts > 1) {
              queueMicrotask(() => {
                request.result = [validTrack];
                request.onsuccess?.();
              });
            }
            return request;
          }
        };
      }
    };
  }
};
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = readRetryDatabase;
      request.onsuccess?.();
    });
    return request;
  }
};

const { default: RetryLibrary } = await import('../js/library.js?read-timeout-retry');
assert.equal(await RetryLibrary.restore(), false, 'uma leitura travada deve encerrar no timeout');
assert.equal(await RetryLibrary.restore(), true, 'a leitura deve poder ser repetida na mesma sessão');
assert.equal(RetryLibrary.getTracks().length, 1);
assert.ok(RetryLibrary.getDiagnostics().some(item => item.code === 'persistence-read-timeout'));

globalThis.window = {};
globalThis.document = {
  createElement() {
    return { setAttribute() {}, click() {} };
  }
};
globalThis.Audio = class {
  removeAttribute() {}
  load() {}
  set src(_) {
    queueMicrotask(() => this.onerror?.());
  }
};
const abortedWriteDatabase = {
  close() {},
  transaction(_storeName, mode) {
    assert.equal(mode, 'readwrite');
    const transaction = {
      error: new Error('quota simulada'),
      objectStore() {
        return {
          put() {
            queueMicrotask(() => transaction.onabort?.());
          }
        };
      }
    };
    return transaction;
  }
};
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = abortedWriteDatabase;
      request.onsuccess?.();
    });
    return request;
  }
};

const { default: WriteLibrary } = await import('../js/library.js?write-abort');
assert.equal(await WriteLibrary.importFiles([
  new File(['áudio'], 'Falha de quota.mp3', { type: 'audio/mpeg' })
]), true, 'uma falha de persistência não deve apagar a faixa importada da memória');
assert.equal(WriteLibrary.getTracks().length, 1);
assert.ok(WriteLibrary.getDiagnostics().some(item => item.code === 'persistence-write-failed'));

console.log('persistence-recovery.test.mjs: abertura/leitura tardias, registro inválido e escrita abortada passaram');
