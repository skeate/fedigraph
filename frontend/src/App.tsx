import React from 'react'
import { SingleValue } from 'react-select'
import Select from 'react-select/async'

import { GraphApi, GraphData, Link, type Node, renderGraph } from './graph'

const graphData = fetch('/graph.json').then(
  (res) => res.json() as Promise<GraphData>,
)

type Remote<T> =
  | { state: 'pending' }
  | { state: 'loaded'; data: T }
  | { state: 'error'; error: string }

type LinkMeta = { name: string; comment?: string }
const linkMeta = (side: 'target' | 'source', link: Link): LinkMeta => {
  if (link.comment !== '') return { name: link[side], comment: link.comment }
  return { name: link[side] }
}

function App() {
  const [data, setData] = React.useState<Remote<GraphData>>({
    state: 'pending',
  })
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null)
  const [graph, setGraph] = React.useState<GraphApi | undefined>(undefined)
  const setSelectedNodeByName = React.useCallback(
    (name: string) => {
      if (data.state === 'loaded') {
        const node = data.data.nodes.find((n) => n.id === name)
        if (node !== undefined) {
          setSelectedNode(node)
          graph?.selectNodeById(node.id)
        }
      }
    },
    [data, graph],
  )
  const renderLinkMeta = React.useCallback(
    (linkMeta: LinkMeta) => (
      <li key={linkMeta.name}>
        <a
          href="#"
          role="button"
          className={linkMeta.comment ? 'has-comment' : ''}
          onClick={(e) => {
            e.preventDefault()
            setSelectedNodeByName(linkMeta.name)
          }}
          aria-describedby={linkMeta.name}
        >
          {linkMeta.name}
        </a>
        {linkMeta.comment && (
          <div role="tooltip" id={linkMeta.name}>
            {linkMeta.comment}
          </div>
        )}
      </li>
    ),
    [setSelectedNodeByName],
  )

  const onClick = React.useCallback((node?: Node) => {
    console.log('in react onclick')
    setSelectedNode(node ?? null)
  }, [])

  React.useEffect(() => {
    if (graph !== undefined) {
      console.log('attaching graph event listeners')
      graph.addSelectListener(onClick)
    }
  }, [graph, onClick])

  React.useEffect(() => {
    const load = async () => {
      try {
        const result = await graphData
        setData({ state: 'loaded', data: result })
        const graph = renderGraph({
          canvas: document.getElementById('graph') as HTMLCanvasElement,
          data: result,
        })
        setGraph(graph)
      } catch (e) {
        setData({
          state: 'error',
          error: e instanceof Error ? e.message : 'unknown error',
        })
      }
    }
    load()
  }, [])

  const limitedFilter = React.useCallback(
    async (input: string) => {
      if (data.state !== 'loaded') {
        return []
      }
      return data.data.nodes
        .filter((n) => n.id.includes(input))
        .slice(0, 10)
        .map((n) => ({ value: n.id, label: n.id }))
    },
    [data],
  )

  const selectedNodeLinks = React.useMemo(() => {
    const links = {
      silences: [] as LinkMeta[],
      blocks: [] as LinkMeta[],
      isSilencedBy: [] as LinkMeta[],
      isBlockedBy: [] as LinkMeta[],
    }
    if (data.state === 'loaded') {
      data.data.links.forEach((link) => {
        if (link.source === selectedNode?.id) {
          if (link.severity === 'silence') {
            links.silences.push(linkMeta('target', link))
          } else if (link.severity === 'suspend') {
            links.blocks.push(linkMeta('target', link))
          }
        } else if (link.target === selectedNode?.id) {
          if (link.severity === 'silence') {
            links.isSilencedBy.push(linkMeta('source', link))
          } else if (link.severity === 'suspend') {
            links.isBlockedBy.push(linkMeta('source', link))
          }
        }
      })
    }
    return links
  }, [selectedNode, data])

  const onChangeHandler = React.useCallback(
    (value: SingleValue<{ value: string; label: string }>) => {
      console.log('in onchange', value)
      if (value === null || value.value === undefined) {
        graph?.unselectNodes()
        setSelectedNode(null)
      } else {
        graph?.selectNodeById(value.value)
        if (data.state === 'loaded')
          setSelectedNode(
            data.data.nodes.find((n) => n.id === value.value) ?? null,
          )
      }
    },
    [data, graph],
  )

  const [panelHidden, setPanelHidden] = React.useState(false)

  const togglePanel = React.useCallback(() => {
    setPanelHidden((h) => !h)
  }, [])

  if (panelHidden) {
    return (
      <div>
        <button onClick={togglePanel}>Show panel</button>
      </div>
    )
  }

  return (
    <>
      <div>
        <button onClick={togglePanel}>Hide panel</button>
      </div>
      {data.state === 'pending' ? (
        <div>Loading data...</div>
      ) : data.state === 'error' ? (
        <div>Error: {data.error}</div>
      ) : (
        <>
          <div>
            <Select
              styles={{
                menu: (base) => ({
                  ...base,
                  color: 'black',
                }),
              }}
              loadOptions={limitedFilter}
              placeholder="Search for a node"
              value={
                selectedNode
                  ? { value: selectedNode.id, label: selectedNode.id }
                  : null
              }
              onChange={onChangeHandler}
            />
          </div>
          <div>
            {selectedNode ? (
              <>
                <p>clicking a node in the list will select it</p>
                <p style={{ position: 'relative' }}>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                    }}
                    className="has-comment"
                    aria-describedby="example-comment"
                    role="button"
                  >
                    this
                  </a>
                  <div role="tooltip" id="example-comment">
                    example comment
                  </div>{' '}
                  means a reason is given for the moderation; hover it to see
                  the reason
                </p>
                <h2>users {selectedNode.users}</h2>
                <h2>silences {selectedNodeLinks.silences.length}</h2>
                <ul>{selectedNodeLinks.silences.map(renderLinkMeta)}</ul>
                <h2>blocks {selectedNodeLinks.blocks.length}</h2>
                <ul>{selectedNodeLinks.blocks.map(renderLinkMeta)}</ul>
                <h2>is silenced by {selectedNodeLinks.isSilencedBy.length}</h2>
                <ul>{selectedNodeLinks.isSilencedBy.map(renderLinkMeta)}</ul>
                <h2>is blocked by {selectedNodeLinks.isBlockedBy.length}</h2>
                <ul>{selectedNodeLinks.isBlockedBy.map(renderLinkMeta)}</ul>
              </>
            ) : (
              <>
                <p>
                  tracking {data.data.links.length} moderations among{' '}
                  {data.data.nodes.length} instances
                </p>
                <p>
                  instance list sourced from{' '}
                  <a href="https://instances.social/">instances.social</a>;
                  block lists sourced from each instance
                </p>
                <p>
                  last updated{' '}
                  {new Date(data.data.lastUpdated).toLocaleString()}
                </p>
                <p>
                  instances do not always share their instance moderation lists;
                  the network shown omits any instances which do not have any
                  known links
                </p>
                <p>
                  "A silences B" means posts from instance B will not show up in
                  the federated feed on instance A, but users from A can still
                  follow users from B
                </p>
                <p>
                  "A blocks B" means posts from instance B will not show up in
                  the federated feed on instance A, and users from A cannot
                  follow users from B
                </p>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default App
