import { api_request } from "@/features/api/client";
import { clear_material_asset_cache } from "@/features/assets/loadCatalog";
import { clear_jianpu_library_cache } from "@/features/jianpu/loadJianpuLibrary";

export interface material_deletion_record {
  material_id: string;
  segment_id: string;
  deletion_status: "deleted";
  deleted_by?: string;
  deleted_at: string;
  updated_at: string;
}

export async function soft_delete_material_segment(
  material_id: string,
  segment_id: string,
): Promise<material_deletion_record> {
  const response = await api_request<{ material_deletion: material_deletion_record }>(
    `/api/v1/admin/materials/${encodeURIComponent(material_id)}/segments/${encodeURIComponent(segment_id)}`,
    { method: "DELETE" },
  );
  clear_material_asset_cache();
  clear_jianpu_library_cache();
  return response.material_deletion;
}
