import * as Crypto from "expo-crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  activateAccountWorkspace,
  materializeLegacyImport,
  prepareLegacyImport,
  updateLegacyImportState
} from "./accountRepository";
import type { LegacyImportProgress } from "./accountTypes";

const UPLOAD_CHUNK_SIZE = 100;
const FILTER_CHUNK_SIZE = 100;

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function cloudPayload(entity: {
  entityType: string;
  localKey: string;
  payload: Record<string, unknown>;
}) {
  return {
    table: entity.entityType,
    localKey: entity.localKey,
    record: entity.payload
  };
}

function isoTimestamp(value: number): string {
  const safeValue = Number.isFinite(value) && value > 0 ? value : Date.now();
  return new Date(safeValue).toISOString();
}

async function entityChecksum(entityIds: string[]): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    [...entityIds].sort().join(",")
  );
}

async function removeStaleIncompleteRows(
  client: SupabaseClient,
  userId: string,
  importId: string,
  currentEntityIds: Set<string>
): Promise<void> {
  const existingIds: string[] = [];
  const pageSize = 1_000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("synced_entities")
      .select("entity_id")
      .eq("user_id", userId)
      .eq("legacy_import_id", importId)
      .order("entity_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    existingIds.push(...(data ?? []).map((row) => String(row.entity_id)));
    if ((data?.length ?? 0) < pageSize) break;
  }

  const staleIds = existingIds.filter((entityId) => !currentEntityIds.has(entityId));
  for (const staleChunk of chunks(staleIds, FILTER_CHUNK_SIZE)) {
    const { error: deleteError } = await client
      .from("synced_entities")
      .delete()
      .eq("user_id", userId)
      .eq("legacy_import_id", importId)
      .in("entity_id", staleChunk);
    if (deleteError) throw deleteError;
  }
}

async function verifyRemotePayloads(
  client: SupabaseClient,
  userId: string,
  importId: string,
  expected: Map<string, string>
): Promise<void> {
  const pageSize = 1_000;
  let verified = 0;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("synced_entities")
      .select("entity_id,payload")
      .eq("user_id", userId)
      .eq("legacy_import_id", importId)
      .order("entity_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const entityId = String(row.entity_id);
      const expectedPayload = expected.get(entityId);
      if (expectedPayload == null || stableJson(row.payload) !== expectedPayload) {
        throw new Error(`Cloud verification failed for ${entityId}.`);
      }
      verified += 1;
    }
    if ((data?.length ?? 0) < pageSize) break;
  }
  if (verified !== expected.size) {
    throw new Error(`Cloud verification expected ${expected.size} records but received ${verified}.`);
  }
}

export async function uploadAndVerifyLegacyData(
  client: SupabaseClient,
  authUserId: string,
  onProgress?: (progress: LegacyImportProgress) => void
): Promise<{ importId: string; recordCount: number; checksum: string }> {
  const prepared = await prepareLegacyImport(authUserId);
  if (prepared.state === "complete") {
    await activateAccountWorkspace(authUserId);
    const recordCount = Object.values(prepared.manifest.tables).reduce(
      (total, value) => total + Math.max(0, Number(value) || 0),
      0
    );
    onProgress?.({ state: "complete", uploaded: recordCount, total: recordCount });
    return { importId: prepared.importId, recordCount, checksum: "" };
  }
  const snapshot = await materializeLegacyImport(authUserId, prepared);
  const total = snapshot.entities.length;
  const checksum = await entityChecksum(snapshot.entities.map((entity) => entity.entityId));
  const manifest = {
    ...snapshot.manifest,
    recordCount: total,
    checksumAlgorithm: "sha256-sorted-entity-ids"
  };

  try {
    await updateLegacyImportState(snapshot.importId, "uploading");
    onProgress?.({ state: "uploading", uploaded: 0, total });

    const { error: batchError } = await client.from("legacy_import_batches").upsert(
      {
        import_id: snapshot.importId,
        user_id: authUserId,
        manifest,
        state: "uploading",
        record_count: total,
        checksum,
        error: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "import_id" }
    );
    if (batchError) throw batchError;

    await removeStaleIncompleteRows(
      client,
      authUserId,
      snapshot.importId,
      new Set(snapshot.entities.map((entity) => entity.entityId))
    );

    let uploaded = 0;
    for (const entityChunk of chunks(snapshot.entities, UPLOAD_CHUNK_SIZE)) {
      const rows = entityChunk.map((entity) => ({
        user_id: authUserId,
        entity_id: entity.entityId,
        entity_type: entity.entityType,
        payload: cloudPayload(entity),
        client_updated_at: isoTimestamp(entity.clientUpdatedAt),
        deleted_at: null,
        legacy_import_id: snapshot.importId
      }));
      const { error: uploadError } = await client
        .from("synced_entities")
        .upsert(rows, { onConflict: "user_id,entity_id" });
      if (uploadError) throw uploadError;
      uploaded += entityChunk.length;
      onProgress?.({ state: "uploading", uploaded, total });
    }

    await updateLegacyImportState(snapshot.importId, "verifying");
    onProgress?.({ state: "verifying", uploaded: total, total });
    await verifyRemotePayloads(
      client,
      authUserId,
      snapshot.importId,
      new Map(
        snapshot.entities.map((entity) => [entity.entityId, stableJson(cloudPayload(entity))])
      )
    );
    const { data: receipt, error: verifyError } = await client.rpc(
      "verify_anthra_legacy_import",
      {
        target_import_id: snapshot.importId,
        expected_record_count: total,
        expected_checksum: checksum
      }
    );
    if (verifyError) throw verifyError;

    await updateLegacyImportState(snapshot.importId, "complete", {
      serverReceipt: JSON.stringify(receipt ?? {})
    });
    await activateAccountWorkspace(authUserId);
    onProgress?.({ state: "complete", uploaded: total, total });
    return { importId: snapshot.importId, recordCount: total, checksum };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Legacy cloud import failed.";
    await updateLegacyImportState(snapshot.importId, "failed", { error: message }).catch(() => undefined);
    try {
      await client
        .from("legacy_import_batches")
        .update({ state: "failed", error: message, updated_at: new Date().toISOString() })
        .eq("import_id", snapshot.importId)
        .eq("user_id", authUserId);
    } catch {
      // The local failed state is authoritative until connectivity returns.
    }
    onProgress?.({ state: "failed", uploaded: 0, total });
    throw error;
  }
}
