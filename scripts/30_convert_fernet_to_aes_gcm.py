#!/usr/bin/env python3
"""
Convert Fernet-encrypted media records to unified AES-GCM encryption

This script can be run from inside the malris container to convert existing
Fernet-encrypted records to the new unified AES-GCM encryption system.

Usage:
    # Dry run to see what would be converted
    python3 30_convert_fernet_to_aes_gcm.py --dry-run

    # Convert specific record by UUID
    python3 30_convert_fernet_to_aes_gcm.py --uuid <uuid>

    # Convert all legacy records
    python3 30_convert_fernet_to_aes_gcm.py --all

    # Convert in batches
    python3 30_convert_fernet_to_aes_gcm.py --batch-size 10
"""

import os
import sys
import argparse
import psycopg2
import hashlib
import hmac
import json
import math
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64

# Database connection parameters
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "comfy-media-db"),
    "port": int(os.getenv("POSTGRES_PORT", 5432)),
    "database": os.getenv("POSTGRES_DB", "comfy_media"),
    "user": os.getenv("POSTGRES_USER", "comfy_user"),
    "password": os.getenv("POSTGRES_PASSWORD", "comfy_secure_password_2024"),
    "connect_timeout": 10,
}

# Encryption settings
ENCRYPTION_KEY = os.getenv(
    "MEDIA_ENCRYPTION_KEY",
    "K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY",
)
SALT = b"comfy_media_salt_v1"
ITERATIONS = 100000

# Chunk sizes
CHUNKING_THRESHOLD = 1024 * 1024  # 1MB
SMALL_FILE_CHUNK_SIZE = 64 * 1024  # 64KB
DEFAULT_CHUNK_SIZE = 1024 * 1024  # 1MB
LOB_CHUNK_SIZE = 64 * 1024  # 64KB for LOB operations


def log_info(msg):
    print(f"[INFO] {msg}")


def log_error(msg):
    print(f"[ERROR] {msg}", file=sys.stderr)


def derive_encryption_key(password):
    """Derive proper 32-byte AES-256 key from password using PBKDF2"""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=ITERATIONS,
        backend=default_backend(),
    )
    return kdf.derive(password.encode())


def get_optimal_chunk_size(file_size):
    """Determine optimal chunk size based on file size"""
    if file_size <= CHUNKING_THRESHOLD:
        return SMALL_FILE_CHUNK_SIZE
    return DEFAULT_CHUNK_SIZE


def decrypt_fernet_data(encrypted_data, encryption_key):
    """Decrypt Fernet-encrypted data using custom implementation matching TypeScript"""
    try:
        # Try to handle different formats of encrypted data
        if isinstance(encrypted_data, memoryview):
            encrypted_data = bytes(encrypted_data)

        # Check if it's raw Fernet token (starts with 0x80) or legacy format
        if encrypted_data[0] == 0x80:
            # This is a raw Fernet token
            fernet_token = encrypted_data
        else:
            # This might be hex-encoded or base64url encoded
            try:
                # Try to decode as hex first
                hex_data = (
                    encrypted_data.hex()
                    if isinstance(encrypted_data, bytes)
                    else encrypted_data
                )
                base64url_string = bytes.fromhex(hex_data).decode("utf-8")
                fernet_token = base64.urlsafe_b64decode(base64url_string.encode())
            except:
                # If that fails, assume it's already a Fernet token
                fernet_token = encrypted_data

        # Use PBKDF2 to derive the key (same as TypeScript implementation)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=SALT,
            iterations=ITERATIONS,
            backend=default_backend(),
        )
        derived_key = kdf.derive(encryption_key.encode())

        # Split key like TypeScript: first 16 bytes for signing, last 16 bytes for encryption
        signing_key = derived_key[:16]
        encryption_key_bytes = derived_key[16:32]

        # Parse Fernet token structure manually (like TypeScript)
        if len(fernet_token) < 57:  # 1 + 8 + 16 + 0 + 32
            raise Exception("Token too short")

        # Parse token components
        version = fernet_token[0]
        timestamp = fernet_token[1:9]
        iv = fernet_token[9:25]
        ciphertext = fernet_token[25:-32]
        hmac_received = fernet_token[-32:]

        # Verify version
        if version != 0x80:
            raise Exception(f"Invalid Fernet version: {version}")

        # Verify HMAC
        data_to_sign = fernet_token[:-32]
        expected_hmac = hmac.new(signing_key, data_to_sign, hashlib.sha256).digest()

        if not hmac_received == expected_hmac:
            raise Exception("HMAC verification failed")

        # Decrypt using AES-128-CBC (like TypeScript)
        cipher = Cipher(
            algorithms.AES(encryption_key_bytes),
            modes.CBC(iv),
            backend=default_backend(),
        )
        decryptor = cipher.decryptor()

        decrypted = decryptor.update(ciphertext) + decryptor.finalize()

        return decrypted

    except Exception as e:
        log_error(f"Failed to decrypt Fernet data: {e}")
        # Don't return original data as fallback - this causes corruption!
        raise e


def encrypt_aes_gcm_chunked(data, encryption_key, chunk_size):
    """Encrypt data using unified AES-GCM approach - compatible with malris format"""
    total_chunks = math.ceil(len(data) / chunk_size)
    encrypted_chunks = []

    # Derive proper 32-byte key for AES-256
    derived_key = derive_encryption_key(encryption_key)

    # Generate a file-specific salt from the encryption key
    file_salt = hashlib.sha256((encryption_key + "file_salt").encode()).digest()

    for i in range(total_chunks):
        start = i * chunk_size
        end = min(start + chunk_size, len(data))
        chunk = data[start:end]

        # Generate deterministic IV for this chunk (same as malris)
        iv_hash = hashlib.sha256()
        iv_hash.update(file_salt)
        iv_hash.update(str(i).encode())
        iv = iv_hash.digest()[:16]  # AES-GCM uses 16-byte IV

        # Encrypt chunk using AES-256-GCM
        cipher = Cipher(
            algorithms.AES(derived_key), modes.GCM(iv), backend=default_backend()
        )
        encryptor = cipher.encryptor()

        encrypted_chunk = encryptor.update(chunk) + encryptor.finalize()
        auth_tag = encryptor.tag

        # Store: IV (16 bytes) + AuthTag (16 bytes) + Encrypted Data (same as malris)
        chunk_with_metadata = iv + auth_tag + encrypted_chunk
        encrypted_chunks.append(chunk_with_metadata)

    encrypted_data = b"".join(encrypted_chunks)

    metadata = {
        "chunkSize": chunk_size,
        "totalChunks": total_chunks,
        "encryptionMethod": "aes-gcm-unified",
        "fileSize": len(data),
    }

    log_info(
        f"Encrypted {len(data)} bytes into {total_chunks} chunks of {chunk_size} bytes each"
    )

    return encrypted_data, metadata


def read_large_object(cursor, oid, file_size):
    """Read Large Object data"""
    cursor.execute("BEGIN")

    try:
        # Open for reading
        cursor.execute("SELECT lo_open(%s, %s)", (oid, 262144))  # Read mode
        fd = cursor.fetchone()[0]

        chunks = []
        total_read = 0

        while total_read < file_size:
            cursor.execute("SELECT lo_read(%s, %s)", (fd, LOB_CHUNK_SIZE))
            chunk = cursor.fetchone()[0]

            if not chunk or len(chunk) == 0:
                break

            chunks.append(chunk)
            total_read += len(chunk)

        cursor.execute("SELECT lo_close(%s)", (fd,))
        cursor.execute("COMMIT")

        return b"".join(chunks)
    except Exception as e:
        cursor.execute("ROLLBACK")
        raise e


def write_large_object(cursor, data):
    """Write data to a new Large Object and return OID"""
    cursor.execute("BEGIN")

    try:
        # Create large object
        cursor.execute("SELECT lo_create(0)")
        oid = cursor.fetchone()[0]

        # Open for writing
        cursor.execute("SELECT lo_open(%s, %s)", (oid, 131072))  # Write mode
        fd = cursor.fetchone()[0]

        # Write data in chunks
        offset = 0
        while offset < len(data):
            chunk_end = min(offset + LOB_CHUNK_SIZE, len(data))
            chunk = data[offset:chunk_end]

            cursor.execute("SELECT lo_write(%s, %s)", (fd, chunk))
            offset = chunk_end

        cursor.execute("SELECT lo_close(%s)", (fd,))
        cursor.execute("COMMIT")

        return oid
    except Exception as e:
        cursor.execute("ROLLBACK")
        raise e


def convert_record(cursor, record):
    """Convert a single record from Fernet to AES-GCM"""
    uuid, encrypted_data, large_object_oid, storage_type, filename, file_size = record

    try:
        log_info(
            f"Converting record {uuid} ({filename}, {storage_type}, {file_size} bytes)"
        )

        # Step 1: Read encrypted data
        log_info(f"Step 1: Reading encrypted data from {storage_type} storage...")
        if storage_type == "bytea":
            encrypted_buffer = bytes(encrypted_data)
            log_info(f"Read {len(encrypted_buffer)} bytes from bytea field")
        else:
            log_info(f"Reading from large object OID {large_object_oid}...")
            encrypted_buffer = read_large_object(cursor, large_object_oid, file_size)
            log_info(f"Read {len(encrypted_buffer)} bytes from large object")

        # Step 2: Decrypt using legacy Fernet encryption
        log_info(f"Step 2: Decrypting {len(encrypted_buffer)} bytes using Fernet...")
        decrypted_data = decrypt_fernet_data(encrypted_buffer, ENCRYPTION_KEY)
        log_info(f"Successfully decrypted {len(decrypted_data)} bytes")

        # Step 3: Re-encrypt using unified AES-GCM
        log_info(f"Step 3: Re-encrypting using AES-GCM...")
        chunk_size = get_optimal_chunk_size(len(decrypted_data))
        log_info(f"Using chunk size: {chunk_size} bytes")
        new_encrypted_data, metadata = encrypt_aes_gcm_chunked(
            decrypted_data, ENCRYPTION_KEY, chunk_size
        )
        log_info(
            f"Re-encrypted to {len(new_encrypted_data)} bytes in {metadata['totalChunks']} chunks"
        )

        # Step 4: Update database record
        log_info(f"Step 4: Updating database record...")
        cursor.execute("BEGIN")

        try:
            if storage_type == "bytea":
                log_info(f"Updating BYTEA record in database...")
                # Update BYTEA record
                cursor.execute(
                    """
                    UPDATE media_records
                    SET encrypted_data = %s,
                        file_size = %s,
                        original_size = %s,
                        encryption_method = 'aes-gcm-unified',
                        chunk_size = %s,
                        metadata = %s,
                        updated_at = NOW()
                    WHERE uuid = %s
                """,
                    (
                        new_encrypted_data,
                        len(new_encrypted_data),
                        len(decrypted_data),
                        metadata["chunkSize"],
                        json.dumps(metadata),
                        uuid,
                    ),
                )
                log_info(f"BYTEA record updated successfully")
            else:
                log_info(f"Updating Large Object record...")
                # Update Large Object
                # First, delete old large object
                log_info(f"Deleting old large object {large_object_oid}...")
                cursor.execute("SELECT lo_unlink(%s)", (large_object_oid,))

                # Create new large object
                log_info(f"Creating new large object...")
                new_oid = write_large_object(cursor, new_encrypted_data)
                log_info(f"Created new large object with OID {new_oid}")

                # Update record
                log_info(f"Updating record with new large object OID...")
                cursor.execute(
                    """
                    UPDATE media_records
                    SET large_object_oid = %s,
                        file_size = %s,
                        original_size = %s,
                        encryption_method = 'aes-gcm-unified',
                        chunk_size = %s,
                        metadata = %s,
                        updated_at = NOW()
                    WHERE uuid = %s
                """,
                    (
                        new_oid,
                        len(new_encrypted_data),
                        len(decrypted_data),
                        metadata["chunkSize"],
                        json.dumps(metadata),
                        uuid,
                    ),
                )
                log_info(f"Large Object record updated successfully")

            log_info(f"Committing transaction...")
            cursor.execute("COMMIT")
            log_info(f"Successfully converted record {uuid}")
            return {"success": True, "uuid": uuid}

        except Exception as e:
            cursor.execute("ROLLBACK")
            raise e

    except Exception as e:
        log_error(f"Failed to convert record {uuid}: {e}")
        return {"success": False, "uuid": uuid, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(
        description="Convert Fernet-encrypted media records to AES-GCM"
    )
    parser.add_argument("--uuid", help="Convert specific record by UUID")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be converted without making changes",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Convert all legacy records in batches until complete",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of records to process in batch (default: 50)",
    )

    args = parser.parse_args()

    # Show usage if no valid options provided
    if not any([args.uuid, args.dry_run, args.all, args.batch_size != 50]):
        parser.print_help()
        return

    try:
        # Connect to database
        log_info(f"Attempting to connect to database with config: {DB_CONFIG}")
        conn = psycopg2.connect(**DB_CONFIG)
        log_info("Database connection successful")
        cursor = conn.cursor()
        log_info("Database cursor created")

        # First, check how many legacy records exist
        log_info("Checking for legacy records...")
        count_query = """
            SELECT COUNT(*) FROM media_records
            WHERE encryption_method IS NULL OR encryption_method != 'aes-gcm-unified'
        """
        cursor.execute(count_query)
        total_legacy_count = cursor.fetchone()[0]
        log_info(f"Found {total_legacy_count} total legacy records in database")

        # Handle specific UUID conversion
        if args.uuid:
            log_info(f"Searching for specific UUID: {args.uuid}")
            query = """
                SELECT uuid, encrypted_data, large_object_oid, storage_type, filename, file_size
                FROM media_records
                WHERE uuid = %s AND (encryption_method IS NULL OR encryption_method != 'aes-gcm-unified')
            """
            cursor.execute(query, (args.uuid,))
            records = cursor.fetchall()

            if not records:
                log_info(f"No legacy record found for UUID: {args.uuid}")
                return

            if args.dry_run:
                log_info("DRY RUN - Would convert:")
                record = records[0]
                uuid, _, _, storage_type, filename, file_size = record
                log_info(f"  - {uuid}: {filename} ({storage_type}, {file_size} bytes)")
                return

            result = convert_record(cursor, records[0])
            if result["success"]:
                log_info(f"✅ Successfully converted record {args.uuid}")
            else:
                log_error(
                    f"❌ Failed to convert record {args.uuid}: {result.get('error', 'Unknown error')}"
                )
            return

        # Handle batch processing (--all or single batch)
        if args.all:
            log_info(
                f"🚀 Starting batch conversion of ALL {total_legacy_count} records with batch size {args.batch_size}"
            )

            total_processed = 0
            total_successful = 0
            total_failed = 0
            batch_number = 1

            while True:
                log_info(f"\n=== BATCH {batch_number} ===")

                # Check remaining records
                cursor.execute(count_query)
                remaining_count = cursor.fetchone()[0]
                log_info(f"Remaining legacy records: {remaining_count}")

                if remaining_count == 0:
                    log_info("🎉 All legacy records have been converted!")
                    break

                # Fetch next batch
                query = """
                    SELECT uuid, encrypted_data, large_object_oid, storage_type, filename, file_size
                    FROM media_records
                    WHERE encryption_method IS NULL OR encryption_method != 'aes-gcm-unified'
                    ORDER BY created_at ASC
                    LIMIT %s
                """
                cursor.execute(query, (args.batch_size,))
                records = cursor.fetchall()

                if not records:
                    log_info("No more records to process")
                    break

                log_info(f"Processing batch of {len(records)} records...")

                if args.dry_run:
                    log_info("DRY RUN - Would convert the following records:")
                    for record in records:
                        uuid, _, _, storage_type, filename, file_size = record
                        log_info(
                            f"  - {uuid}: {filename} ({storage_type}, {file_size} bytes)"
                        )

                    total_processed += len(records)
                    log_info(
                        f"DRY RUN: Batch {batch_number} complete - would process {len(records)} records"
                    )
                    log_info(
                        f"DRY RUN: Overall progress: {total_processed}/{total_legacy_count} records ({(total_processed/total_legacy_count)*100:.1f}%)"
                    )

                    batch_number += 1
                    if batch_number > 3:  # Limit dry run to 3 batches for demo
                        log_info("DRY RUN: Stopping after 3 sample batches")
                        break
                    continue

                # Convert records in this batch
                batch_results = []
                for i, record in enumerate(records, 1):
                    log_info(
                        f"Processing record {i}/{len(records)}: {record[0]} ({record[4]})"
                    )
                    result = convert_record(cursor, record)
                    batch_results.append(result)

                    if result["success"]:
                        log_info(f"✅ Record {i}/{len(records)} converted successfully")
                    else:
                        log_error(
                            f"❌ Record {i}/{len(records)} failed: {result.get('error', 'Unknown error')}"
                        )

                # Batch summary
                batch_successful = len([r for r in batch_results if r["success"]])
                batch_failed = len([r for r in batch_results if not r["success"]])

                total_processed += len(records)
                total_successful += batch_successful
                total_failed += batch_failed

                log_info(
                    f"Batch {batch_number} complete: {batch_successful} successful, {batch_failed} failed"
                )
                log_info(
                    f"Overall progress: {total_processed}/{total_legacy_count} records processed ({(total_processed/total_legacy_count)*100:.1f}%)"
                )

                if batch_failed > 0:
                    log_error("Failed conversions in this batch:")
                    for r in batch_results:
                        if not r["success"]:
                            log_error(f"  - {r['uuid']}: {r['error']}")

                batch_number += 1

            # Final summary
            log_info(f"\n=== FINAL SUMMARY ===")
            log_info(f"Total batches processed: {batch_number - 1}")
            log_info(f"Total records processed: {total_processed}")
            log_info(f"Total successful: {total_successful}")
            log_info(f"Total failed: {total_failed}")

        else:
            # Single batch processing
            log_info(f"Processing single batch of {args.batch_size} records")

            query = """
                SELECT uuid, encrypted_data, large_object_oid, storage_type, filename, file_size
                FROM media_records
                WHERE encryption_method IS NULL OR encryption_method != 'aes-gcm-unified'
                ORDER BY created_at ASC
                LIMIT %s
            """
            cursor.execute(query, (args.batch_size,))
            records = cursor.fetchall()

            if not records:
                log_info("No legacy records found to convert")
                return

            log_info(f"Found {len(records)} legacy records to convert")

            if args.dry_run:
                log_info("DRY RUN - Would convert the following records:")
                for record in records:
                    uuid, _, _, storage_type, filename, file_size = record
                    log_info(
                        f"  - {uuid}: {filename} ({storage_type}, {file_size} bytes)"
                    )
                return

            # Convert records
            results = []
            log_info(f"Starting conversion of {len(records)} records...")
            for i, record in enumerate(records, 1):
                log_info(
                    f"Processing record {i}/{len(records)}: {record[0]} ({record[4]})"
                )
                result = convert_record(cursor, record)
                results.append(result)

                if result["success"]:
                    log_info(f"✅ Record {i}/{len(records)} converted successfully")
                else:
                    log_error(
                        f"❌ Record {i}/{len(records)} failed: {result.get('error', 'Unknown error')}"
                    )

            # Summary
            successful = len([r for r in results if r["success"]])
            failed = len([r for r in results if not r["success"]])

            log_info(f"Conversion complete: {successful} successful, {failed} failed")

            if failed > 0:
                log_error("Failed conversions:")
                for r in results:
                    if not r["success"]:
                        log_error(f"  - {r['uuid']}: {r['error']}")

    except Exception as e:
        log_error(f"Conversion script failed: {e}")
        sys.exit(1)
    finally:
        if "conn" in locals():
            conn.close()


if __name__ == "__main__":
    main()
