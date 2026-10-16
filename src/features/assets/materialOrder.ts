import type { material_id } from "./types";

export const textbook_material_order: readonly material_id[] = [
  "john-thompson-easiest-1",
  "john-thompson-easiest-2",
  "beyer",
  "hanon",
];

const textbook_material_rank = new Map(
  textbook_material_order.map((material_id, index) => [material_id, index]),
);

export function order_textbook_materials<T extends { id: material_id }>(
  materials: readonly T[],
): T[] {
  return materials
    .map((material, source_index) => ({ material, source_index }))
    .sort((left, right) => {
      const rank_difference =
        (textbook_material_rank.get(left.material.id) ?? Number.MAX_SAFE_INTEGER) -
        (textbook_material_rank.get(right.material.id) ?? Number.MAX_SAFE_INTEGER);
      return rank_difference || left.source_index - right.source_index;
    })
    .map(({ material }) => material);
}
