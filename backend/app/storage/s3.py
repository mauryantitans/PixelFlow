"""S3-compatible object storage (AWS S3, Cloudflare R2, MinIO) via boto3.

Objects are written without an ACL, so they are private (bucket default). The
API keeps serving the bytes itself, so the existing auth/ownership checks are
the only way to reach an image; there are no public or presigned URLs.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from .base import ObjectNotFound, StorageError

# DeleteObjects accepts at most 1000 keys per request.
_DELETE_BATCH = 1000
_MISSING_CODES = {"NoSuchKey", "404", "NotFound"}


class S3Store:
    keeps_bytes_in_database = False

    def __init__(
        self,
        bucket: str,
        *,
        region: str | None = None,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        client: Any = None,
    ) -> None:
        if not bucket:
            raise StorageError("S3Store needs a bucket name (S3_BUCKET).")
        self.bucket = bucket
        if client is None:
            import boto3
            from botocore.config import Config

            client = boto3.client(
                "s3",
                region_name=region or None,
                endpoint_url=endpoint_url or None,
                aws_access_key_id=access_key_id or None,
                aws_secret_access_key=secret_access_key or None,
                config=Config(
                    signature_version="s3v4",
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=5,
                    read_timeout=30,
                ),
            )
        self._client = client

    def put(self, key: str, data: bytes, content_type: str) -> None:
        try:
            self._client.put_object(
                Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
            )
        except Exception as e:  # botocore ClientError / BotoCoreError
            raise StorageError(f"Could not store image object {key!r}: {_describe(e)}") from e

    def get(self, key: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
            return bytes(response["Body"].read())
        except Exception as e:
            if _error_code(e) in _MISSING_CODES:
                raise ObjectNotFound(f"Image object {key!r} is missing from the bucket.") from e
            raise StorageError(f"Could not read image object {key!r}: {_describe(e)}") from e

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            raise StorageError(f"Could not delete image object {key!r}: {_describe(e)}") from e

    def delete_many(self, keys: Iterable[str]) -> None:
        unique = list(dict.fromkeys(k for k in keys if k))
        failed: list[str] = []
        for start in range(0, len(unique), _DELETE_BATCH):
            batch = unique[start : start + _DELETE_BATCH]
            try:
                response = self._client.delete_objects(
                    Bucket=self.bucket,
                    Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
                )
            except Exception as e:
                raise StorageError(
                    f"Could not delete {len(unique) - start} image object(s): {_describe(e)}"
                ) from e
            failed.extend(err.get("Key", "?") for err in response.get("Errors", []))
        if failed:
            raise StorageError(
                f"Could not delete {len(failed)} image object(s), e.g. {failed[0]!r}."
            )


def _error_code(error: Exception) -> str:
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        return str(response.get("Error", {}).get("Code", ""))
    return ""


def _describe(error: Exception) -> str:
    code = _error_code(error)
    return f"{code}: {error}" if code else str(error)
