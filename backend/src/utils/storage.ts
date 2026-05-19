// src/utils/storage.ts
// 文件存储抽象。当前支持两种驱动:
//   - local: 写到 UPLOAD_DIR,下载走流式响应,主要用于开发/单机部署
//   - oss:   写到阿里云 OSS,下载返回带签名的临时 URL,生产推荐
// 切换驱动: 设置环境变量 STORAGE_DRIVER=local|oss。

import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import OSS from 'ali-oss';
import { AppError, ErrorCode } from './errors';

export interface PutInput {
  studentId: string;
  fileId: string;
  ext: string;
  mimeType: string;
  body: Buffer;
}

export interface PutResult {
  /**
   * 持久化到 DB 的存储引用。
   * - local: 绝对文件路径
   * - oss:   OSS object key (相对 bucket 根)
   */
  storageKey: string;
  size: number;
}

export interface GetResult {
  /** 直接流式回源(local) */
  stream?: Readable;
  /** 重定向到这个 URL,客户端自行下载(oss) */
  signedUrl?: string;
  contentLength?: number;
}

export interface StorageAdapter {
  driver: 'local' | 'oss';
  put(input: PutInput): Promise<PutResult>;
  get(storageKey: string, downloadFilename?: string): Promise<GetResult>;
  delete(storageKey: string): Promise<void>;
}

// ─── Local 实现 ───────────────────────────────────────────
class LocalStorage implements StorageAdapter {
  driver = 'local' as const;
  private readonly rootReal: string;

  constructor(public readonly root: string) {
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    this.rootReal = path.resolve(root);
  }

  private assertWithinRoot(absPath: string): void {
    const resolved = path.resolve(absPath);
    const safeRoot = this.rootReal.endsWith(path.sep) ? this.rootReal : this.rootReal + path.sep;
    if (resolved !== this.rootReal && !resolved.startsWith(safeRoot)) {
      throw new AppError(ErrorCode.FORBIDDEN, '文件路径越权', 403);
    }
  }

  async put(input: PutInput): Promise<PutResult> {
    // 同 OSS 一致的相对路径,但本地落到 UPLOAD_DIR/<相对路径>
    const relative = buildObjectKey(input);
    const abs = path.resolve(this.rootReal, relative);
    this.assertWithinRoot(abs);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await fs.promises.writeFile(abs, input.body);
    return { storageKey: abs, size: input.body.length };
  }

  async get(storageKey: string): Promise<GetResult> {
    this.assertWithinRoot(storageKey);
    if (!fs.existsSync(storageKey)) {
      throw new AppError(ErrorCode.NOT_FOUND, '文件实体不存在,请联系管理员重新上传', 404);
    }
    const stat = await fs.promises.stat(storageKey);
    return { stream: fs.createReadStream(storageKey), contentLength: stat.size };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      this.assertWithinRoot(storageKey);
    } catch (_err) {
      // 越权路径直接跳过,不抛错以免阻塞 DB 行删除
      return;
    }
    if (fs.existsSync(storageKey)) {
      await fs.promises.unlink(storageKey);
    }
  }
}

// ─── OSS 实现 ────────────────────────────────────────────
class OssStorage implements StorageAdapter {
  driver = 'oss' as const;
  private client: OSS;

  constructor(config: {
    region: string;
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint?: string;
  }) {
    this.client = new OSS({
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      secure: true,
    });
  }

  async put(input: PutInput): Promise<PutResult> {
    const key = buildObjectKey(input);
    await this.client.put(key, input.body, {
      mime: input.mimeType,
    });
    return { storageKey: key, size: input.body.length };
  }

  async get(storageKey: string, downloadFilename?: string): Promise<GetResult> {
    // 直接签发临时 URL。强制 octet-stream 让浏览器始终走"下载"路径，
    // 即使对象本身的 Content-Type 是 image/html 也不会被内联渲染。
    const response: Record<string, string> = {
      'content-type': 'application/octet-stream',
    };
    if (downloadFilename) {
      response['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(downloadFilename)}`;
    }
    const url = this.client.signatureUrl(storageKey, {
      expires: 3600, // 1h
      response,
    });
    return { signedUrl: url };
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await this.client.delete(storageKey);
    } catch (err: unknown) {
      // 对象不存在视为成功(幂等)
      const code = (err as { code?: string } | null)?.code;
      if (code === 'NoSuchKey') return;
      throw err;
    }
  }
}

// ─── 工厂 ─────────────────────────────────────────────────
function buildObjectKey(input: PutInput): string {
  const safeExt = input.ext.replace(/[^.\w-]/g, '').slice(0, 16);
  return `students/${input.studentId}/${input.fileId}_${Date.now()}${safeExt}`;
}

let cached: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (cached) return cached;
  const driver = (process.env['STORAGE_DRIVER'] ?? 'local').toLowerCase();
  if (driver === 'oss') {
    const region = process.env['OSS_REGION'];
    const accessKeyId = process.env['OSS_ACCESS_KEY_ID'];
    const accessKeySecret = process.env['OSS_ACCESS_KEY_SECRET'];
    const bucket = process.env['OSS_BUCKET'];
    if (!region || !accessKeyId || !accessKeySecret || !bucket) {
      throw new Error(
        'STORAGE_DRIVER=oss 但 OSS_REGION/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_BUCKET 未配齐',
      );
    }
    cached = new OssStorage({
      region,
      accessKeyId,
      accessKeySecret,
      bucket,
      endpoint: process.env['OSS_ENDPOINT'],
    });
  } else {
    const root = process.env['UPLOAD_DIR'] ?? path.resolve(process.cwd(), 'uploads');
    cached = new LocalStorage(root);
  }
  return cached;
}

// 测试/重配置时手动重置(目前仅 dev 用)
export function resetStorageForTesting(): void {
  cached = null;
}
