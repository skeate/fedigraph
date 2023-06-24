import React from 'react'
import { SingleValue } from 'react-select'
import Select from 'react-select/async'
import useLocation from 'wouter/use-location'

import type { GraphApi, GraphData, Link, Node } from './graph'

const aGraph = import('./graph')

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
  const [location, setLocation] = useLocation({})
  const [data, setData] = React.useState<Remote<GraphData>>({
    state: 'pending',
  })
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null)
  const [graph, setGraph] = React.useState<GraphApi | undefined>(undefined)

  const setSelectedNodeByName = React.useCallback(
    (name: string | null) => {
      if (name === null) {
        setSelectedNode(null)
        graph?.unselectNodes()
        return
      }
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

  React.useEffect(() => {
    if (data.state === 'loaded') {
      if (location !== '/') {
        setSelectedNodeByName(location.slice(1))
      } else {
        setSelectedNodeByName(null)
      }
    }
  }, [data.state, location, setSelectedNodeByName])

  const renderLinkMeta = React.useCallback(
    (linkMeta: LinkMeta) => (
      <li key={linkMeta.name}>
        <a
          href="#"
          role="button"
          className={linkMeta.comment ? 'has-comment' : ''}
          onClick={(e) => {
            e.preventDefault()
            setLocation('/' + linkMeta.name)
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
    [setLocation],
  )

  const onClick = React.useCallback(
    (node?: Node) => {
      setLocation('/' + (node ? node.id : ''))
    },
    [setLocation],
  )

  React.useEffect(() => {
    if (graph !== undefined) {
      graph.addSelectListener(onClick)
    }
  }, [graph, onClick])

  React.useEffect(() => {
    const load = async () => {
      try {
        const result = await graphData
        setData({ state: 'loaded', data: result })
        const graph = (await aGraph).renderGraph({
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
      if (value === null || value.value === undefined) {
        setLocation('/')
      } else {
        setLocation('/' + value.value)
      }
    },
    [setLocation],
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
                  {new Date(data.data.last_updated).toLocaleString()}
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
