import logging
import os
import requests
from datetime import datetime
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

# source: https://stackoverflow.com/a/68583332/5994461

THREAD_POOL = 16

# This is how to create a reusable connection pool with python requests.
session = requests.Session()
session.mount(
    "https://",
    requests.adapters.HTTPAdapter(
        pool_maxsize=THREAD_POOL, max_retries=0, pool_block=True
    ),
)


def get_instance_blocks(instance):
    url = "https://{}/api/v1/instance/domain_blocks".format(instance)
    try:
        response = session.get(url, headers={"Accept": "application/json"}, timeout=10)
    except:
        # logging.error("%s failed, timeout", url)
        return None
    if response.status_code != 200:
        # logging.error("%s failed, error code %s", response.url, response.status_code)
        return None
    else:
        try:
            # logging.info(
            #     "%s took %s seconds", response.url, response.elapsed.total_seconds()
            # )
            return (instance, response.json())
        except:
            # logging.error("%s failed, invalid json", response.url)
            return None


def download(instances):
    # fd = open('data/graph.json', 'w')
    # fd.write('{"lastUpdated":"{}",'.format(datetime.now().isoformat()))
    graph_data = {"lastUpdated": datetime.now().isoformat(), "nodes": [], "links": []}
    mapped_instances = {instance["name"]: instance["users"] for instance in instances}
    nodes_with_links = set()
    linked_nodes = set()
    with ThreadPoolExecutor(max_workers=THREAD_POOL) as executor:
        for idx, response in enumerate(
            executor.map(get_instance_blocks, mapped_instances.keys())
        ):
            try:
                print("Processing {} of {}".format(idx, len(mapped_instances)))
                if response is not None:
                    name, blocklist = response
                    if len(blocklist) > 0:
                        nodes_with_links.add(name)
                        linked_nodes.add(name)
                        for block in blocklist:
                            linked_nodes.add(block["domain"])
                            graph_data["links"].append(
                                {
                                    "source": name,
                                    "target": block["domain"],
                                    "severity": block["severity"],
                                    "comment": block["comment"],
                                }
                            )
            except:
                logging.error("Failed to process %s", response)
        for linked_node in linked_nodes:
            graph_data["nodes"].append(
                {
                    "id": linked_node,
                    "users": mapped_instances[linked_node]
                    if linked_node in mapped_instances
                    else 0,
                    "public_blocks": linked_node in nodes_with_links,
                }
            )
    fd = open("graph.json", "w")
    json.dump(graph_data, fd)
    fd.close()
    logging.info(
        "Done. Found %s nodes and %s links",
        len(graph_data["nodes"]),
        len(graph_data["links"]),
    )


def main():
    logging.basicConfig(
        format="%(asctime)s.%(msecs)03d %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    instances = session.get(
        "https://instances.social/api/1.0/instances/list?count=0",
        headers={
            "Authorization": "Bearer {}".format(
                os.environ.get("INSTANCES_SOCIAL_API_KEY")
            )
        },
    ).json()

    download(instances["instances"])


if __name__ == "__main__":
    main()

"""
const getInstances = async () = > {
    const res = await downloadWithCache < ListInstancesResponse > (
        ,
        'data/instances.json',
        {
            Authorization: `Bearer ${process.env.INSTANCES_SOCIAL_API_KEY}`,
        },
    )
    if (res.tag == = 'error') {
        throw new Error('failed to load instances')
    }
    return res.data.instances
}

type InstanceSet = ReadonlySet < string >
const filterToKnownInstances = <A > (
    instanceSet: InstanceSet,
    getName: (a: A)=> string,
    as: ReadonlyArray < A >,
) = > as .filter((a)= > instanceSet.has(getName(a)))

const getInstanceModerated =
(instanceSet: InstanceSet) = > async (instance: Instance) = > {
    try {
        const moderated = await downloadWithCache < ModeratedResponse > (`https: //${instance.name}/api/v1/instance/domain_blocks`,
                                                                         `data/instances /${instance.name}-moderated.json`,
                                                                         )
        if (moderated.tag == = 'error') {
            return moderated
        }
        return {
            tag: moderated.tag,
            data: filterToKnownInstances(
                instanceSet,
                (x)= > x.domain,
                moderated.data,
            ),
        }
    } catch(e) {
        return {
            tag: 'error' as const,
            message: e instanceof Error ? e.message: 'unknown',
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
        moderated: ReadonlyArray < {
            domain: string
            severity: 'silence' | 'suspend'
            comment: string
        } >
    }
)
const getInstanceInfo =
(instanceSet: InstanceSet, onDone?: (msg: string)=> void) = >
async (instance: Instance): Promise < InstanceMeta > = > {
    const moderated = await getInstanceModerated(instanceSet)(instance)
    onDone?.(`${instance.name}: ${moderated.tag}`)

    const meta: InstanceMeta =
    moderated.tag == = 'error'
          ? {
              name: instance.name,
              users: instance.users,
              moderatedVisibility: 'hidden',
    }: {
              name: instance.name,
              users: instance.users,
              moderatedVisibility: 'public',
              moderated: moderated.data,
    }
    await new Promise((resolve)=> setTimeout(resolve, 100))
    return meta
}

async function worker(
    id: string,
    allInstanceNames: InstanceSet,
    queue: Array < Instance >,
    onDone: (msg: string)=> void,
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
    instances: Array < Instance >,
    batchSize: number,
    onDone: (msg: string)=> void,
) {
    const digitSize = batchSize.toString().length
    const set = new Set(instances.map((instance)=> instance.name))
    const queue = [...instances]
    return Promise.all(
        [...Array(batchSize)].map((_, i)=>
                                  worker(
                                  (i + 1).toString().padStart(digitSize, ' '), set, queue, onDone),
                                  ),
    ).then((results)= > results.flat())
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
    nodes: ReadonlyArray < Node >
    links: ReadonlyArray < Link >
}

const getGraphData = (meta: ReadonlyArray < InstanceMeta >): GraphData = > {
    const links = meta.flatMap((instanceInfo)=>
                               instanceInfo.moderatedVisibility === 'hidden'
                               ? []: instanceInfo.moderated.map(
        ({domain, severity, comment}): Link=> ({
            source: instanceInfo.name,
            target: domain,
            type: severity,
            comment,
        }),
    ),
    )

    const nodesWithEdges = new Set(
        links.flatMap(({source, target})=> [source, target]),
    )
    const nodes = meta
    .filter(({name})= > nodesWithEdges.has(name))
    .map(({name, users})= > ({id: name, users}))

    return {
        nodes,
        links,
    }
}

const main = async () = > {
    const instances = await getInstances()
    console.log(`got ${instances.length} instances`)
    const bar = new MultiBar({
        hideCursor: true,
        etaBuffer: 50,
    })
    const progress = bar.create(instances.length, 0)
    // const instanceSet = new Set(instances.map((instance)=> instance.name))
    // const handle = getInstanceInfo(instanceSet, (msg)=> {
        // progress.increment()
        // bar.log(msg + '\n')
        // })
    // const results = await Promise.all(instances.map(handle))
    const results = await batch(instances, 1000, (msg: string)=> {
        // console.log(msg)
        progress.increment()
        bar.log(msg + '\n')
    })
    bar.stop()
    console.log('done getting instance info')
    const graphData = getGraphData(results)
    console.log(`converted to graph: ${graphData.nodes.length} nodes and ${graphData.links.length} links`,
                )
    await fs.writeFile('data/instance-graph.json', JSON.stringify(graphData), {
        encoding: 'utf-8',
    })
    console.log('wrote graph file')
}

main()
"""
