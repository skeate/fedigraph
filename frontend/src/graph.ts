import {
  Graph as Cosmos,
  Graph,
  GraphConfigInterface,
} from '@cosmograph/cosmos'

export interface Node {
  id: string
  users: number
}

export type Link = {
  source: string
  target: string
  severity: 'silence' | 'suspend'
  comment?: string
}

export type GraphData = {
  last_updated: string
  nodes: Node[]
  links: Link[]
}

interface GraphParams {
  canvas: HTMLCanvasElement
  data: GraphData
}

export type GraphApi = {
  addSelectListener: (listener: (node: Node | undefined) => void) => void
  selectNodeById: (id: string) => void
  unselectNodes: () => void
}

let globalGraph: Graph<Node, Link> | undefined = undefined

export const renderGraph = ({ canvas, data }: GraphParams): GraphApi => {
  const config: GraphConfigInterface<Node, Link> = {
    backgroundColor: '#151515',
    nodeColor: '#6364FFaa',
    linkGreyoutOpacity: 0,
    linkColor: (link) => {
      switch (link.severity) {
        case 'silence':
          return '#55fe'
        case 'suspend':
          return '#f00a'
        default:
          return 'grey'
      }
    },
    nodeSize: (node) => Math.max(Math.log(node.users), 1),
    simulation: {
      center: 1,
      decay: 300,
      linkDistance: 50,
      repulsion: 0.5,
      gravity: 0.5,
    },
  }

  const graph = globalGraph ?? (globalGraph = new Cosmos(canvas, config))
  const { nodes, links } = data
  graph.setData(nodes, links)
  graph.zoom(4)

  return {
    addSelectListener: (onClick) =>
      graph.setConfig({
        events: {
          onClick: (node) => {
            if (node === undefined) graph.unselectNodes()
            else graph.selectNodeById(node.id, true)
            onClick(node)
          },
        },
      }),
    selectNodeById: (id) => graph.selectNodeById(id, true),
    unselectNodes: () => graph.unselectNodes(),
  }
}
