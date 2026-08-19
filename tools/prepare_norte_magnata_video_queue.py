#!/usr/bin/env python3
"""Prepara, sem gerar mídia, o handoff de vídeo Norte Magnata para Flow e Dola."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any


FLOW_BLOCKS = {"B01", "B02", "B05", "B06", "B07", "B08"}
DOLA_BLOCKS = {"B03", "B04"}
EXPECTED_TOTAL = 50
BOILERPLATE = (
    "full-bleed", "no readable text", "no logos", "no brands", "no white",
    "no mat", "no frame", "no inset", "no blank card", "no vertical side bars",
)


def load_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"JSON precisa ser objeto: {path}")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def compact_english_visual(scene: dict[str, Any]) -> str:
    raw = re.sub(r"\s+", " ", str(scene.get("prompt_imagem") or "")).strip()
    clauses = [part.strip(" .") for part in raw.split(";")]
    useful = [part for part in clauses if part and not any(marker in part.lower() for marker in BOILERPLATE)]
    visual = "; ".join(useful[-3:]) or "Hiro and every existing object remain visually consistent"
    visual = visual.replace("[Hiro]", "Hiro")
    return visual[:75].rsplit(" ", 1)[0].rstrip(" ,.;")


def camera_instruction(scene: dict[str, Any]) -> str:
    source = str(scene.get("movimento") or "").lower()
    if "dolly" in source or "aproxima" in source:
        return "Use a slow push-in with depth parallax."
    if "pan" in source or "lateral" in source:
        return "Use lateral camera drift with layered parallax."
    if "zoom" in source:
        return "Use a subtle optical push without reframing."
    return "Use restrained camera drift and layered parallax."


def provider_prompt(scene: dict[str, Any], native_duration: int) -> str:
    visual = compact_english_visual(scene)
    prompt = (
        f"Animate the exact reference image for {native_duration} seconds. {visual}. "
        "Continue the visible action as one causal beat and finish with a clear material result. "
        f"{camera_instruction(scene)} Preserve Hiro, framing, faces, hands and objects. "
        "No loop, cuts, morphing, new objects, text, logos or camera shake."
    )
    return re.sub(r"\s+", " ", prompt).strip()


def prepare(map_path: Path, approval_path: Path, preflight_path: Path, automation_root: Path) -> dict[str, Any]:
    content_map = load_object(map_path)
    approval = load_object(approval_path)
    preflight = load_object(preflight_path)
    if preflight.get("decision") != "approved_for_full_queue" or preflight.get("full_queue_ready") is not True:
        raise ValueError("Preflight V2 ainda não liberou a fila integral.")

    scenes = [scene for block in content_map.get("blocks", []) for scene in block.get("cenas", [])]
    by_id = {str(scene.get("id_cena")): scene for scene in scenes}
    approved = {str(item.get("id_cena")): item for item in approval.get("cenas", [])}
    promotions = {str(item.get("scene_id")): item for item in preflight.get("full_video_queue", [])}
    video_ids = {
        str(scene.get("id_cena")) for scene in scenes if scene.get("midia_principal") == "video_gerado"
    } | set(promotions)
    if len(video_ids) != EXPECTED_TOTAL:
        raise ValueError(f"Fila deveria conter {EXPECTED_TOTAL} vídeos, encontrou {len(video_ids)}.")

    shared_root = automation_root / "00_compartilhado"
    if not (shared_root / "duracoes_video.py").is_file():
        raise ValueError(f"Módulo compartilhado ausente: {shared_root / 'duracoes_video.py'}")
    import sys
    if str(shared_root) not in sys.path:
        sys.path.insert(0, str(shared_root))
    from duracoes_video import choose_native_duration

    rows: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    for scene in scenes:
        scene_id = str(scene.get("id_cena"))
        if scene_id not in video_ids:
            continue
        block_id = str(scene.get("id_bloco"))
        provider = "flow" if block_id in FLOW_BLOCKS else "dola" if block_id in DOLA_BLOCKS else ""
        if not provider:
            raise ValueError(f"{scene_id}: bloco sem provedor.")
        source = approved.get(scene_id)
        if not source:
            raise ValueError(f"{scene_id}: imagem aprovada ausente.")
        image_path = Path(str(source.get("arquivo") or ""))
        expected_hash = str(source.get("sha256") or "")
        if not image_path.is_file() or sha256_file(image_path) != expected_hash:
            raise ValueError(f"{scene_id}: arquivo ou hash da imagem diverge.")
        if expected_hash in seen_hashes:
            raise ValueError(f"{scene_id}: imagem duplicada na fila.")
        seen_hashes.add(expected_hash)
        duration = float(scene.get("duracao_seg") or 0)
        native = int(choose_native_duration(provider, duration))
        rows.append({
            "ordem": len(rows) + 1,
            "id_bloco": block_id,
            "id_cena": scene_id,
            "provider": provider,
            "inicio": scene.get("inicio", ""),
            "fim": scene.get("fim", ""),
            "duracao_cena_seg": duration,
            "duracao_nativa_seg": native,
            "imagem_origem": str(image_path),
            "imagem_sha256": expected_hash,
            "prompt_provider_en": provider_prompt(scene, native),
            "origem_decisao": "promocao_editorial_v2" if scene_id in promotions else "mapa_canonico",
            "criterio_rejeicao": scene.get("criterio_rejeicao", ""),
            "status": "pronto_sem_dispatch",
        })

    counts = {provider: sum(row["provider"] == provider for row in rows) for provider in ("flow", "dola")}
    if counts != {"flow": 39, "dola": 11}:
        raise ValueError(f"Distribuição inesperada: {counts}")
    return {
        "schema_version": 1,
        "status": "prepared_not_started",
        "generation_started": False,
        "production_id": approval.get("production_id"),
        "mapa_conteudo_sha256": approval.get("mapa_conteudo_sha256"),
        "contract_id": "norte_magnata_provedores_video_v4_contentflow",
        "execucao_assets_id": approval.get("execucao_assets_id"),
        "routing": {"flow": sorted(FLOW_BLOCKS), "dola": sorted(DOLA_BLOCKS)},
        "counts": {"total": len(rows), **counts},
        "requirements": {
            "flow": "sessão autenticada, extensão 2.3.7 e porta 8766",
            "dola": "8/8 guias saudáveis e livres, perfis conectados, extensão 0.9.28 e porta 8775",
            "dispatch_policy": "fila integral; não iniciar com capacidade parcial",
        },
        "cenas": rows,
    }


def write_runtime_bundle(output: Path, handoff: dict[str, Any]) -> dict[str, str]:
    bundle = output.parent / "provider-runtime"
    flow_input = bundle / "flow-input"
    references = bundle / "reference-links"
    identity = {
        "production_id": handoff["production_id"],
        "mapa_conteudo_sha256": handoff["mapa_conteudo_sha256"],
        "contract_id": "norte_magnata_provedores_video_v3",
        "execucao_assets_id": handoff["execucao_assets_id"],
    }
    blocks: dict[str, list[dict[str, Any]]] = {}
    for row in handoff["cenas"]:
        link_dir = references / row["id_bloco"] / row["id_cena"]
        link_dir.mkdir(parents=True, exist_ok=True)
        link = link_dir / Path(row["imagem_origem"]).name
        if link.is_symlink() or link.exists():
            link.unlink()
        os.symlink(row["imagem_origem"], link)
        flow = row["provider"] == "flow"
        scene = {
            "id_bloco": row["id_bloco"],
            "id_cena": row["id_cena"],
            "inicio": row["inicio"],
            "fim": row["fim"],
            "duracao_seg": row["duracao_cena_seg"],
            "descricao_visual": row["prompt_provider_en"],
            "movimento_sugerido": "continuous causal action with restrained camera motion",
            "mudanca_interna": "clear material result at the end of the shot",
            "video_flow": {
                "usar": flow,
                "imagem_status": "aprovada_para_video_flow",
                "status_video_flow": "aprovada_para_preparar_flow",
                "duracao_seg": row["duracao_nativa_seg"],
                "prompt_video": row["prompt_provider_en"],
                "prompt_provider_en": row["prompt_provider_en"],
                "prompt_provider_imagem_sha256": row["imagem_sha256"],
                "modelo": "omni flash",
                "prioridade": "alta",
                "risco_distorcao": "medio",
                "ordem_manual_flow": row["ordem"],
                "criterio_rejeicao_video": row["criterio_rejeicao"],
            },
            "video_cena": {
                "usar_dola": not flow,
                "avaliar_para_dola": not flow,
                "avaliar_para_video": not flow,
                "duracao_dola_seg": row["duracao_nativa_seg"] if not flow else None,
                "prompt_movimento_base": row["prompt_provider_en"] if not flow else "",
                "prioridade_video": 100 - row["ordem"],
                "risco_distorcao": "medio",
                "valor_video": "alto",
                "imagem_status": "aprovada_para_video_dola" if not flow else "fora_escopo_dola",
            },
        }
        blocks.setdefault(row["id_bloco"], []).append(scene)
    runtime_map = {
        "schema_version": 1,
        "identidade_producao": identity,
        **identity,
        "blocos": [{"id_bloco": block, "cenas": scenes} for block, scenes in sorted(blocks.items())],
    }
    map_path = bundle / "mapa_videos_provedores.json"
    flow_map = flow_input / "mapa_assets_revisado_video_flow.json"
    project_path = bundle / "projeto_dola_contentflow.json"
    atomic_json(map_path, runtime_map)
    atomic_json(flow_map, runtime_map)
    atomic_json(project_path, {
        "nome_projeto": handoff["production_id"],
        "mapa_json_externo": str(map_path),
        "pasta_imagens_finais_externa": str(references),
        "homologacao_status": "homologado",
        "homologacao_provider": "dola",
        "homologacao_manifesto": str(output),
        "identidade_producao": identity,
        "observacao": "Handoff ContentFlow V2; preparação local sem API e sem dispatch.",
    })
    return {
        "runtime_map": str(map_path),
        "reference_links": str(references),
        "flow_input": str(flow_input),
        "dola_project": str(project_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--map", required=True, type=Path)
    parser.add_argument("--approval", required=True, type=Path)
    parser.add_argument("--preflight", required=True, type=Path)
    parser.add_argument("--automation-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = prepare(
        args.map.expanduser().resolve(),
        args.approval.expanduser().resolve(),
        args.preflight.expanduser().resolve(),
        args.automation_root.expanduser().resolve(),
    )
    output = args.output.expanduser().resolve()
    result["runtime_bundle"] = write_runtime_bundle(output, result)
    atomic_json(output, result)
    print(json.dumps({"status": result["status"], "counts": result["counts"], "output": str(output), "runtime_bundle": result["runtime_bundle"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
