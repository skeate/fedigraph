use futures::{stream, StreamExt};
use reqwest::header::AUTHORIZATION;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::env;
use std::error::Error;
use std::fs::File;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio;

#[derive(Debug, Serialize, Deserialize)]
struct Instance {
    name: String,
    users: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstanceList {
    instances: Vec<Instance>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Moderation {
    domain: String,
    severity: String,
    comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GraphNode {
    id: String,
    users: i32,
    public_moderation: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GraphLink {
    source: String,
    target: String,
    severity: String,
    comment: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GraphData {
    last_updated: String,
    nodes: Vec<GraphNode>,
    links: Vec<GraphLink>,
}

async fn get_moderation(
    instance: Instance,
) -> Result<(String, bool, Vec<Moderation>), Box<dyn Error>> {
    let client = reqwest::Client::new();
    let resp = client
        .get(&format!(
            "https://{}/api/v1/instance/domain_blocks",
            instance.name
        ))
        .timeout(Duration::new(5, 0))
        .send()
        .await?;
    match resp.status() {
        reqwest::StatusCode::OK => match resp.json::<Vec<Moderation>>().await {
            Ok(moderation) => {
                return Ok((instance.name.clone(), true, moderation));
            }
            Err(e) => {
                println!("Error ({}): {}", instance.name, e);
                return Ok((instance.name.clone(), false, Vec::new()));
            }
        },
        reqwest::StatusCode::NOT_FOUND => {
            return Ok((instance.name.clone(), false, Vec::new()));
        }
        other => {
            println!("Error for {}: {}", instance.name, other);
            return Ok((instance.name.clone(), false, Vec::new()));
        }
    }
}

async fn get_instance_list(api_key: String) -> Result<Vec<Instance>, Box<dyn Error>> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://instances.social/api/1.0/instances/list?count=10")
        .header(AUTHORIZATION, format!("Bearer {}", api_key))
        .send()
        .await?;
    match resp.status() {
        reqwest::StatusCode::OK => match resp.json::<InstanceList>().await {
            Ok(instance_list) => {
                return Ok(instance_list.instances);
            }
            Err(e) => {
                println!("Error: {}", e);
                return Ok(Vec::new());
            }
        },
        reqwest::StatusCode::UNAUTHORIZED => {
            println!("Need new API key");
            return Ok(Vec::new());
        }
        other => {
            println!("Error: {}", other);
            return Ok(Vec::new());
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let key = env::var("INSTANCES_SOCIAL_API_KEY");

    if key.is_err() {
        println!("INSTANCES_SOCIAL_API_KEY not set");
        return Ok(());
    }

    let instance_list = get_instance_list(key.unwrap()).await?;
    let instance_count = instance_list.len();
    println!("found {} instances", instance_list.len());
    let instance_map = HashMap::<String, i32>::from_iter(
        instance_list
            .iter()
            .map(|i| (i.name.clone(), i.users.parse::<i32>().unwrap_or(0))),
    );
    let instance_moderations = stream::iter(instance_list)
        .map(|instance| get_moderation(instance))
        .buffer_unordered(100);

    let graph = GraphData {
        last_updated: chrono::Utc::now().to_rfc3339(),
        nodes: Vec::new(),
        links: Vec::new(),
    };
    let linked_nodes = HashSet::new();
    let public_lists = HashSet::new();

    let instance_map_arc = Arc::new(instance_map);
    let graph_arc = Arc::new(Mutex::new(graph));
    let linked_nodes_arc = Arc::new(Mutex::new(linked_nodes));
    let public_lists_arc = Arc::new(Mutex::new(public_lists));

    instance_moderations
        .enumerate()
        .for_each(|(i, moderation)| {
            let gc = graph_arc.clone();
            let lnc = linked_nodes_arc.clone();
            let plc = public_lists_arc.clone();
            let imc = instance_map_arc.clone();
            return async move {
                match moderation {
                    Ok((name, public, moderations)) => {
                        println!(
                            "[{: >5}/{: >5}] found {} moderations for {} ({})",
                            i + 1,
                            instance_count,
                            moderations.len(),
                            name,
                            if public { "public" } else { "private" }
                        );
                        if moderations.len() > 0 {
                            lnc.lock().unwrap().insert(name.clone());
                            plc.lock().unwrap().insert(name.clone());
                        }
                        for m in moderations {
                            let domain = m.domain.clone();
                            if imc.contains_key(&domain) {
                                lnc.lock().unwrap().insert(domain);
                                gc.lock().unwrap().links.push(GraphLink {
                                    source: name.clone(),
                                    target: m.domain.clone(),
                                    severity: m.severity.clone(),
                                    comment: m.comment.clone(),
                                });
                            }
                        }
                    }
                    Err(e) => {
                        println!("Error: {}", e);
                    }
                }
            };
        })
        .await;

    linked_nodes_arc.lock().unwrap().iter().for_each(|name| {
        let imc = instance_map_arc.clone();
        if imc.contains_key(name) {
            graph_arc.clone().lock().unwrap().nodes.push(GraphNode {
                id: name.clone(),
                users: imc.get(name).unwrap_or(&0).clone(),
                public_moderation: public_lists_arc.lock().unwrap().contains(name),
            });
        }
    });

    println!("done loading instance moderations");
    let g = graph_arc.lock().unwrap();
    println!("found {} nodes and {} edges", g.nodes.len(), g.links.len());
    println!("writing graph data to file");
    let mut file = File::create("graph.json")?;
    serde_json::to_writer_pretty(
        &mut file,
        &GraphData {
            last_updated: g.last_updated.clone(),
            nodes: g.nodes.clone(),
            links: g.links.clone(),
        },
    )?;
    return Ok(());
}
