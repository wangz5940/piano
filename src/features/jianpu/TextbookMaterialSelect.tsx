import { BookOpenText, ChevronDown } from "lucide-react";

import type { jianpu_material } from "./types";

const material_labels: Record<string, string> = {
  "john-thompson-easiest-1": "小汤 1",
  "john-thompson-easiest-2": "小汤 2",
  beyer: "拜厄",
  hanon: "哈农",
};

export function TextbookMaterialSelect({
  materials, selected_material, on_select,
}: {
  materials: jianpu_material[];
  selected_material: jianpu_material;
  on_select: (material: jianpu_material) => void;
}) {
  return (
    <div className="textbook-material-picker">
      <label className="textbook-material-select" title={selected_material.title}>
        <BookOpenText size={18} aria-hidden="true" />
        <select aria-label="教材选择" value={selected_material.id}
          onChange={(event) => {
            const material = materials.find((item) => item.id === event.target.value);
            if (material) on_select(material);
          }}>
          {materials.map((material) => (
            <option key={material.id} value={material.id} title={material.title}>
              {material_labels[material.id] ?? material.title}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </label>
      <span className="textbook-material-context">{selected_material.title}</span>
    </div>
  );
}
