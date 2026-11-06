import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * 사용자 OpenAI 키 암호화 (AES-256-GCM). 서버 환경변수 KEY_ENCRYPTION_SECRET 로만 풀 수 있다 —
 * 데이터베이스가 새어도 키는 읽을 수 없고, 사이트 운영자도 화면에서 키를 볼 수 없다(끝 4자리만).
 */
function secretKey(): Buffer {
  const s = process.env.KEY_ENCRYPTION_SECRET;
  if (!s || s.length < 16) throw new Error("KEY_ENCRYPTION_SECRET 이 없어요.");
  return createHash("sha256").update(s).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function unseal(box: string): string {
  const [v, iv, tag, enc] = box.split(".");
  if (v !== "v1") throw new Error("알 수 없는 형식");
  const d = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64")), d.final()]).toString("utf8");
}
