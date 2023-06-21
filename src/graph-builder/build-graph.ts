import { MultiBar } from 'cli-progress'
import 'dotenv/config'
import * as fs from 'fs/promises'
import * as path from 'path'

type Instance = {
  id: string
  name: string
  added_at: null | string
  updated_at: null | string
  checked_at: null | string
  uptime: number
  up: boolean
  dead: boolean
  version: null | string
  ipv6: boolean
  https_score: null | number
  https_rank: null | string
  obs_score: null | number
  obs_rank: null | string
  users: number
  statuses: number
  connections: number
  open_registrations: boolean
  info?: Partial<{
    short_description: null | string
    full_description: null | string
    topic: null | string
    languages: null | Array<string>
    other_languages_accepted: boolean
    federates_with: null | 'all' | 'some'
    prohibited_content:
      | 'nudity_nocw'
      | 'nudity_all'
      | 'pornography_nocw'
      | 'pornography_all'
      | 'illegalContentLinks'
      | 'spam'
      | 'advertising'
      | 'spoilers_nocw'
      | 'sexism'
      | 'racism'
      | 'hateSpeeches'
      | 'harrassment'
    categories: null | Array<string>
  }>
  thumbnail: null | string
  thumbnail_proxy: null | string
  active_users: null | number
  email: null | string
  admin: null | string
}

type ListInstancesResponse = {
  instances: Array<Instance>
}

type ModeratedResponse = Array<{
  domain: string
  digest: string
  severity: 'silence' | 'suspend'
  comment: string
}>

const timedJsonFetch = async <A>(
  url: string,
  options?: { headers?: Record<string, string>; timeout?: number },
): Promise<A> => {
  const { headers = {}, timeout = 10000 } = options ?? {}

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  const response = await fetch(url, { headers, signal: controller.signal })
  clearTimeout(timeoutId)
  return response.json()
}

const downloadWithCache = async <A>(
  url: string,
  filename: string,
  headers?: Record<string, string>,
): Promise<
  | { tag: 'downloaded'; data: A }
  | { tag: 'cached'; data: A }
  | { tag: 'error'; message: string }
> => {
  try {
    const fileContents = await fs.readFile(filename, { encoding: 'utf-8' })
    const file: A = JSON.parse(fileContents)
    return { tag: 'cached', data: file }
  } catch (e) {
    try {
      const file = await timedJsonFetch<A>(url, { headers })
      await fs.mkdir(path.dirname(filename), { recursive: true })
      await fs.writeFile(filename, JSON.stringify(file), { encoding: 'utf-8' })
      return { tag: 'downloaded', data: file }
    } catch (e) {
      return {
        tag: 'error',
        message: e instanceof Error ? e.message : 'unknown',
      }
    }
  }
}

const getInstances = async () => {
  const res = await downloadWithCache<ListInstancesResponse>(
    'https://instances.social/api/1.0/instances/list?count=0',
    'data/instances.json',
    {
      Authorization: `Bearer ${process.env.INSTANCES_SOCIAL_API_KEY}`,
    },
  )
  if (res.tag === 'error') {
    throw new Error('failed to load instances')
  }
  return res.data.instances
}

type InstanceSet = ReadonlySet<string>
const filterToKnownInstances = <A>(
  instanceSet: InstanceSet,
  getName: (a: A) => string,
  as: ReadonlyArray<A>,
) => as.filter((a) => instanceSet.has(getName(a)))

const getInstanceModerated =
  (instanceSet: InstanceSet) => async (instance: Instance) => {
    try {
      const moderated = await downloadWithCache<ModeratedResponse>(
        `https://${instance.name}/api/v1/instance/domain_blocks`,
        `data/instances/${instance.name}-moderated.json`,
      )
      if (moderated.tag === 'error') {
        return moderated
      }
      return {
        tag: moderated.tag,
        data: filterToKnownInstances(
          instanceSet,
          (x) => x.domain,
          moderated.data,
        ),
      }
    } catch (e) {
      return {
        tag: 'error' as const,
        message: e instanceof Error ? e.message : 'unknown',
      }
    }
  }

type InstanceMeta = {
  name: string
  users: number
} & (
  | {
      moderatedVisibility: 'hidden'
    }
  | {
      moderatedVisibility: 'public'
      moderated: ReadonlyArray<{
        domain: string
        severity: 'silence' | 'suspend'
        comment: string
      }>
    }
)
const getInstanceInfo =
  (instanceSet: InstanceSet) =>
  async (instance: Instance): Promise<InstanceMeta> => {
    const moderated = await getInstanceModerated(instanceSet)(instance)

    const meta: InstanceMeta =
      moderated.tag === 'error'
        ? {
            name: instance.name,
            users: instance.users,
            moderatedVisibility: 'hidden',
          }
        : {
            name: instance.name,
            users: instance.users,
            moderatedVisibility: 'public',
            moderated: moderated.data,
          }
    return meta
  }

async function worker(
  id: string,
  allInstanceNames: InstanceSet,
  queue: Array<Instance>,
  onDone: (msg: string) => void,
) {
  const handle = getInstanceInfo(allInstanceNames)
  const processed = []
  while (queue.length > 0) {
    const instance = queue.pop()
    if (instance) {
      processed.push(await handle(instance))
      onDone(`worker ${id}: ${instance.name}`)
    }
  }
  return processed
}

async function batch(
  instances: Array<Instance>,
  batchSize: number,
  onDone: (msg: string) => void,
) {
  const digitSize = batchSize.toString().length
  const set = new Set(instances.map((instance) => instance.name))
  const queue = [...instances]
  return Promise.all(
    [...Array(batchSize)].map((_, i) =>
      worker((i + 1).toString().padStart(digitSize, ' '), set, queue, onDone),
    ),
  ).then((results) => results.flat())
}

interface Node {
  id: string
  users: number
}

type Link = {
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

type GraphData = {
  nodes: ReadonlyArray<Node>
  links: ReadonlyArray<Link>
}

const getGraphData = (meta: ReadonlyArray<InstanceMeta>): GraphData => {
  const links = meta.flatMap((instanceInfo) =>
    instanceInfo.moderatedVisibility === 'hidden'
      ? []
      : instanceInfo.moderated.map(
          ({ domain, severity, comment }): Link => ({
            source: instanceInfo.name,
            target: domain,
            type: severity,
            comment,
          }),
        ),
  )

  const nodesWithEdges = new Set(
    links.flatMap(({ source, target }) => [source, target]),
  )
  const nodes = meta
    .filter(({ name }) => nodesWithEdges.has(name))
    .map(({ name, users }) => ({ id: name, users }))

  return {
    nodes,
    links,
  }
}

const main = async () => {
  const instances = await getInstances()
  console.log(`got ${instances.length} instances`)
  const bar = new MultiBar({
    hideCursor: true,
    etaBuffer: 50,
  })
  const progress = bar.create(instances.length, 0)
  const results = await batch(instances, 15, (msg: string) => {
    // console.log(msg)
    progress.increment()
    bar.log(msg + '\n')
  })
  console.log('done getting instance info')
  const graphData = getGraphData(results)
  console.log(
    `converted to graph: ${graphData.nodes.length} nodes and ${graphData.links.length} links`,
  )
  await fs.writeFile('data/instance-graph.json', JSON.stringify(graphData), {
    encoding: 'utf-8',
  })
  console.log('wrote graph file')
  console.log((process as any)._getActiveHandles())
  console.log((process as any)._getActiveRequests())
}

main()
