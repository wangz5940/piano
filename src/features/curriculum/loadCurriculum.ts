import { api_request } from "@/features/api/client";

import type {
  active_curriculum,
  curriculum_node_record,
  curriculum_node_tree,
} from "./types";
import {
  assert_published_curriculum,
  load_published_curriculum_snapshot,
  save_published_curriculum_snapshot,
} from "./snapshot";

let active_curriculum_cache: Promise<active_curriculum> | undefined;

export async function load_active_curriculum({
  storage,
}: {
  storage?: Storage;
} = {}): Promise<active_curriculum> {
  active_curriculum_cache ??= api_request<{ curriculum: active_curriculum }>(
    "/api/v1/curriculums/active",
  )
    .then((response) => {
      assert_published_curriculum(response.curriculum);
      const curriculum = normalize_active_curriculum(response.curriculum);
      save_published_curriculum_snapshot(curriculum, storage);
      return curriculum;
    })
    .catch((error: unknown) => {
      const snapshot = load_published_curriculum_snapshot(storage);
      if (snapshot) {
        return normalize_active_curriculum(snapshot);
      }
      active_curriculum_cache = undefined;
      throw error;
    });

  return active_curriculum_cache;
}

export function clear_active_curriculum_cache(): void {
  active_curriculum_cache = undefined;
}

export function build_curriculum_tree(nodes: curriculum_node_record[]): curriculum_node_tree[] {
  const by_id = new Map<string, curriculum_node_tree>();
  for (const node of nodes) {
    by_id.set(node.id, { ...node, children: [] });
  }

  const roots: curriculum_node_tree[] = [];
  for (const node of by_id.values()) {
    if (node.parent_id && by_id.has(node.parent_id)) {
      by_id.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  sort_tree(roots);
  return roots;
}

function sort_tree(nodes: curriculum_node_tree[]): void {
  nodes.sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
  for (const node of nodes) {
    sort_tree(node.children);
  }
}

function normalize_active_curriculum(value: active_curriculum): active_curriculum {
  return {
    ...value,
    nodes: value.nodes
      .filter((node) => node.status === "active")
      .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title)),
  };
}
