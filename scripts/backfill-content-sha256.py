"""Backfill media_records.content_sha256 by decrypting each row's
encrypted_data and hashing the plaintext.

Idempotent: only rows where content_sha256 IS NULL are touched. Pre-existing
duplicate content is left as NULL on the later rows (the UNIQUE index would
reject the second UPDATE) and reported at the end so the user can pick a
canonical row to keep.

Usage:
  MEDIA_ENCRYPTION_KEY=... python3 backfill-content-sha256.py [--workers N] [--dry-run]
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass

import base64

import psycopg2
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", "3432")),
    "dbname": os.environ.get("DB_NAME", "comfy_media"),
    "user": os.environ.get("DB_USER", "comfy_user"),
    "password": os.environ.get("DB_PASSWORD", "comfy_secure_password_2024"),
}

PASSWORD = os.environ.get(
    "MEDIA_ENCRYPTION_KEY",
    "K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY",
)


# ---- crypto: must match malris/server/services/chunkEncryption.ts ----


def derive_key(password: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), b"comfy_media_salt_v1", 100_000, 32)


def file_salt(password: str) -> bytes:
    return hashlib.sha256((password + "file_salt").encode()).digest()


def chunk_iv(salt: bytes, index: int) -> bytes:
    return hashlib.sha256(salt + str(index).encode()).digest()[:16]


_DERIVED_KEY = derive_key(PASSWORD)
_FILE_SALT = file_salt(PASSWORD)
# Fernet key is the same PBKDF2-derived 32 bytes, base64url-encoded — matches
# the FernetEncryptor in malris/server/utils/encryption.ts.
_FERNET = Fernet(base64.urlsafe_b64encode(_DERIVED_KEY))


def decrypt_fernet(encrypted: bytes) -> bytes:
    """Legacy 'full-file' rows: bytea is a *raw* Fernet token (starts with 0x80).
    The standard cryptography.Fernet API expects a base64url-encoded token, so
    we have to re-encode the raw bytes before handing them off."""
    return _FERNET.decrypt(base64.urlsafe_b64encode(encrypted))


def decrypt_chunked(encrypted: bytes, chunk_size: int, total_chunks: int, file_size: int) -> bytes:
    out = bytearray()
    offset = 0
    for i in range(total_chunks):
        plaintext_len = chunk_size if i < total_chunks - 1 else file_size - (chunk_size * (total_chunks - 1))
        iv = encrypted[offset : offset + 16]
        tag = encrypted[offset + 16 : offset + 32]
        ct = encrypted[offset + 32 : offset + 32 + plaintext_len]
        offset += 32 + plaintext_len
        cipher = Cipher(algorithms.AES(_DERIVED_KEY), modes.GCM(iv, tag)).decryptor()
        out.extend(cipher.update(ct) + cipher.finalize())
    return bytes(out)


# ---- worker ----


@dataclass
class Result:
    uuid: str
    sha256_hex: str | None = None  # None on error
    error: str | None = None


def worker(uuid_batch: list[str]) -> list[Result]:
    """Each worker opens its own connection. Returns a Result per uuid.

    Does NOT do the UPDATE — the parent process does that serially so it can
    detect UNIQUE conflicts deterministically and report collisions.
    """
    results: list[Result] = []
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT uuid::text, encryption_method, encryption_metadata, encrypted_data "
                "FROM media_records WHERE uuid = ANY(%s::uuid[])",
                (uuid_batch,),
            )
            for uuid, method, meta, enc in cur.fetchall():
                try:
                    if enc is None:
                        results.append(Result(uuid, error="encrypted_data is NULL (LOB?)"))
                        continue
                    enc_bytes = bytes(enc)
                    if method == "aes-gcm-unified":
                        plain = decrypt_chunked(enc_bytes, meta["chunkSize"], meta["totalChunks"], meta["fileSize"])
                    elif method == "full-file":
                        plain = decrypt_fernet(enc_bytes)
                    else:
                        results.append(Result(uuid, error=f"unknown encryption_method={method}"))
                        continue
                    results.append(Result(uuid, sha256_hex=hashlib.sha256(plain).hexdigest()))
                except Exception as e:
                    results.append(Result(uuid, error=f"{type(e).__name__}: {e}"))
    finally:
        conn.close()
    return results


# ---- driver ----


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=50, help="uuids per worker invocation")
    parser.add_argument("--dry-run", action="store_true", help="compute hashes but don't UPDATE")
    parser.add_argument("--limit", type=int, default=None, help="process at most N rows (testing)")
    args = parser.parse_args()

    conn = psycopg2.connect(**DB_CONFIG)
    conn.autocommit = True  # UPDATE per row so a conflict on one doesn't poison the rest
    with conn.cursor() as cur:
        sql = "SELECT uuid::text FROM media_records WHERE content_sha256 IS NULL AND storage_type = 'bytea'"
        if args.limit:
            sql += f" LIMIT {args.limit}"
        cur.execute(sql)
        all_uuids = [r[0] for r in cur.fetchall()]

    total = len(all_uuids)
    print(f"to backfill: {total} rows  |  workers={args.workers}  |  batch={args.batch_size}  |  dry_run={args.dry_run}")
    if total == 0:
        return

    batches = [all_uuids[i : i + args.batch_size] for i in range(0, total, args.batch_size)]

    backfilled = 0
    collisions: list[tuple[str, str, str]] = []  # (new_uuid, existing_uuid, sha)
    errors: list[tuple[str, str]] = []
    started = time.monotonic()

    with ProcessPoolExecutor(max_workers=args.workers) as pool, conn.cursor() as cur:
        futures = [pool.submit(worker, batch) for batch in batches]
        last_report = started
        for fut in as_completed(futures):
            for r in fut.result():
                if r.error:
                    errors.append((r.uuid, r.error))
                    continue
                sha_bytes = bytes.fromhex(r.sha256_hex)
                if args.dry_run:
                    backfilled += 1
                    continue
                try:
                    cur.execute(
                        "UPDATE media_records SET content_sha256 = %s "
                        "WHERE uuid = %s AND content_sha256 IS NULL",
                        (sha_bytes, r.uuid),
                    )
                    backfilled += 1
                except psycopg2.errors.UniqueViolation:
                    # Another row already has this hash. Look up the canonical
                    # uuid so the user can decide what to do with this dup.
                    cur.execute(
                        "SELECT uuid::text FROM media_records WHERE content_sha256 = %s LIMIT 1",
                        (sha_bytes,),
                    )
                    existing = cur.fetchone()
                    collisions.append((r.uuid, existing[0] if existing else "?", r.sha256_hex))
            now = time.monotonic()
            if now - last_report >= 5.0:
                elapsed = now - started
                rate = (backfilled + len(collisions) + len(errors)) / max(elapsed, 0.001)
                done = backfilled + len(collisions) + len(errors)
                eta = (total - done) / max(rate, 0.001)
                print(f"  progress: {done}/{total}  rate={rate:.0f}/s  eta={eta:.0f}s  collisions={len(collisions)}  errors={len(errors)}")
                last_report = now

    elapsed = time.monotonic() - started
    print()
    print(f"done in {elapsed:.1f}s")
    print(f"  backfilled: {backfilled}")
    print(f"  collisions (pre-existing dups, left NULL): {len(collisions)}")
    print(f"  errors: {len(errors)}")

    if collisions:
        print()
        print("collisions — first 20 (uuid_left_null, existing_uuid_with_hash, sha256):")
        for nu, eu, sha in collisions[:20]:
            print(f"  {nu}  →  {eu}  {sha}")
        if len(collisions) > 20:
            print(f"  ... and {len(collisions) - 20} more")
        # Persist full list for the user
        out_path = "/tmp/dop-dedup-backfill-collisions.txt"
        with open(out_path, "w") as f:
            for nu, eu, sha in collisions:
                f.write(f"{nu}\t{eu}\t{sha}\n")
        print(f"  full list: {out_path}")

    if errors:
        print()
        print("errors — first 10:")
        for uu, msg in errors[:10]:
            print(f"  {uu}: {msg}")

    if errors:
        sys.exit(2)


if __name__ == "__main__":
    main()
