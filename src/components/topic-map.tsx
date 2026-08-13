"use client";

import * as React from "react";
import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check, Lock, Sparkles } from "lucide-react";
import type { Concept } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TopicMapProps {
  concepts: Concept[];
  activeId?: string;
  onSelect: (id: string) => void;
}

type ConceptNodeData = {
  concept: Concept;
  active: boolean;
};

const NODE_WIDTH = 216;
const NODE_HEIGHT = 92;

function ConceptNode({ data }: NodeProps<Node<ConceptNodeData>>) {
  const { concept, active } = data;
  const progress = Math.round(concept.mastery * 100);
  return (
    <div
      className={cn(
        "w-[216px] border bg-background px-3 py-2.5 shadow-sm transition-colors",
        active ? "border-primary ring-2 ring-primary/15" : "border-border hover:border-primary/50",
        concept.status === "locked" && "border-dashed opacity-65"
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-primary/60" />
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
            concept.status === "mastered" && "bg-primary text-primary-foreground",
            concept.status === "in-progress" && "bg-warning/20 text-warning-foreground",
            concept.status === "available" && "bg-primary/10 text-primary",
            concept.status === "locked" && "bg-muted text-muted-foreground"
          )}
        >
          {concept.status === "mastered" ? (
            <Check className="size-3.5" />
          ) : concept.status === "locked" ? (
            <Lock className="size-3" />
          ) : (
            <Sparkles className="size-3" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{concept.title}</div>
          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{concept.unit}</span>
            <span>{Math.round(concept.examWeight * 100)}% exam</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-primary/60" />
    </div>
  );
}

const nodeTypes = { concept: ConceptNode };

function buildGraph(concepts: Concept[], activeId?: string) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 34, ranksep: 64, marginx: 28, marginy: 28 });

  concepts.forEach((concept) => graph.setNode(concept.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  concepts.forEach((concept) =>
    concept.dependencies.forEach((dependency) => {
      if (concepts.some((candidate) => candidate.id === dependency)) {
        graph.setEdge(dependency, concept.id);
      }
    })
  );
  dagre.layout(graph);

  const nodes: Node<ConceptNodeData>[] = concepts.map((concept) => {
    const point = graph.node(concept.id);
    return {
      id: concept.id,
      type: "concept",
      position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
      data: { concept, active: concept.id === activeId },
    };
  });

  const edges: Edge[] = concepts.flatMap((concept) =>
    concept.dependencies
      .filter((dependency) => concepts.some((candidate) => candidate.id === dependency))
      .map((dependency) => ({
        id: `${dependency}-${concept.id}`,
        source: dependency,
        target: concept.id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 13, height: 13 },
        style: {
          stroke: concept.id === activeId || dependency === activeId ? "var(--primary)" : "var(--border)",
          strokeWidth: concept.id === activeId || dependency === activeId ? 2 : 1.4,
        },
      }))
  );
  return { nodes, edges };
}

export function TopicMap({ concepts, activeId, onSelect }: TopicMapProps) {
  const { nodes, edges } = React.useMemo(
    () => buildGraph(concepts, activeId),
    [concepts, activeId]
  );

  return (
    <div className="h-full min-h-[500px] w-full overflow-hidden border bg-card/30">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.1, minZoom: 0.56, maxZoom: 0.9 }}
        minZoom={0.42}
        maxZoom={1.35}
        panOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        {concepts.length > 7 && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={(node) =>
              (node.data as ConceptNodeData).concept.status === "mastered"
                ? "var(--primary)"
                : "var(--muted)"
            }
            maskColor="color-mix(in oklch, var(--background) 75%, transparent)"
          />
        )}
      </ReactFlow>
    </div>
  );
}
