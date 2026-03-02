export interface GraphNode {
  id: string;
  pos: string;
  definitions: string[];
  x?: number;
  y?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
