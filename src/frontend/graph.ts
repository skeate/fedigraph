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
} & (
  | {
      type: 'peer'
    }
  | {
      type: 'silence' | 'suspend'
      comment: string
    }
)

interface GraphParams {
  canvas: HTMLCanvasElement
  data: {
    nodes: Node[]
    links: Link[]
  }
}

export type GraphApi = {
  addSelectListener: (listener: (node: Node | undefined) => void) => void
  selectNodeById: (id: string) => void
  unselectNodes: () => void
}

let globalGraph: Graph<Node, Link> | undefined = undefined

export const renderGraph = ({ canvas, data }: GraphParams): GraphApi => {
  const config: GraphConfigInterface<Node, Link> = {
    // backgroundColor: '#151515',
    nodeColor: '#6364FFaa',
    linkGreyoutOpacity: 0,
    linkColor: (link) => {
      switch (link.type) {
        case 'silence':
          return '#88fa'
        case 'suspend':
          return '#f00a'
        default:
          return 'grey'
      }
    },
    nodeSize: (node) => Math.max(Math.log(node.users), 1),
    simulation: {
      center: 0.5,
      // decay: 10000,
      linkDistance: 50,
      // linkSpring: 5,
      repulsion: 0.5,
      // repulsionTheta: 1,
      // gravity: 0,
    },
  }

  const graph = globalGraph ?? (globalGraph = new Cosmos(canvas, config))
  const { nodes, links } = data
  graph.setData(nodes, links)
  graph.zoom(2)

  return {
    addSelectListener: (onClick) =>
      graph.setConfig({
        events: {
          onClick: (node) => {
            console.log('in graph onclick')
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
