#!/usr/bin/env python3
"""
Test Fernet decryption to verify we're getting the correct data
"""

import os
import sys
import psycopg2
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
import base64
import hmac
import hashlib

# Database connection parameters
DB_CONFIG = {
    "host": "comfy-media-db",
    "port": 5432,
    "database": "comfy_media",
    "user": "comfy_user",
    "password": "comfy_secure_password_2024",
    "connect_timeout": 10,
}

ENCRYPTION_KEY = "K8mF3vN9pQ2sT6wY0zC4eH7jL1nP5rU8xA3dG6iK9mO2qT5wZ8cF1hJ4lN7pS0vY"
SALT = b"comfy_media_salt_v1"
ITERATIONS = 100000


def decrypt_fernet_data(encrypted_data, encryption_key):
    """Decrypt Fernet-encrypted data"""
    try:
        # Try to handle different formats of encrypted data
        if isinstance(encrypted_data, memoryview):
            encrypted_data = bytes(encrypted_data)

        print(f"Encrypted data length: {len(encrypted_data)}")
        print(f"First 20 bytes: {encrypted_data[:20].hex()}")

        # Check if it's raw Fernet token (starts with 0x80) or legacy format
        if encrypted_data[0] == 0x80:
            print("Detected raw Fernet token")
            fernet_token = encrypted_data
        else:
            print("Trying to decode as hex/base64url")
            try:
                # Try to decode as hex first
                hex_data = (
                    encrypted_data.hex()
                    if isinstance(encrypted_data, bytes)
                    else encrypted_data
                )
                base64url_string = bytes.fromhex(hex_data).decode("utf-8")
                fernet_token = base64.urlsafe_b64decode(base64url_string.encode())
                print(f"Decoded token length: {len(fernet_token)}")
            except Exception as e:
                print(f"Decode failed: {e}, assuming it's already a Fernet token")
                fernet_token = encrypted_data

        # Use PBKDF2 to derive the Fernet key (same as original implementation)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=SALT,
            iterations=ITERATIONS,
            backend=default_backend(),
        )
        derived_key = kdf.derive(encryption_key.encode())

        # Fernet uses the first 16 bytes for signing, last 16 bytes for encryption
        # But we need to create a proper Fernet key (32 bytes base64url encoded)
        fernet_key = base64.urlsafe_b64encode(derived_key)
        f = Fernet(fernet_key)

        decrypted = f.decrypt(fernet_token)
        print(f"Successfully decrypted {len(decrypted)} bytes")
        print(f"First 20 bytes of decrypted: {decrypted[:20].hex()}")

        return decrypted

    except Exception as e:
        print(f"Failed to decrypt Fernet data: {e}")
        import traceback

        traceback.print_exc()
        return None


def main():
    # Test with the original record
    uuid = "76157c1f-775e-4b3a-b619-c2b4c8285abf"

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        cursor.execute(
            "SELECT encrypted_data FROM media_records WHERE uuid = %s", (uuid,)
        )

        result = cursor.fetchone()
        if not result:
            print("Record not found")
            return

        encrypted_data = bytes(result[0])
        print(f"Retrieved encrypted data for {uuid}")

        decrypted = decrypt_fernet_data(encrypted_data, ENCRYPTION_KEY)

        if decrypted:
            # Check if it's a valid JPEG
            if decrypted[:2] == b"\xff\xd8":
                print("✓ Decrypted data appears to be a valid JPEG!")
            else:
                print("✗ Decrypted data does not appear to be a valid JPEG")
                print(f"Expected: ff d8, Got: {decrypted[:2].hex()}")

    except Exception as e:
        print(f"Test failed: {e}")
    finally:
        if "conn" in locals():
            conn.close()


if __name__ == "__main__":
    main()
