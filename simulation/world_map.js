// world_map.js
const fs = require("fs");
const path = require("path");

let cloudConfig = null;
const configPath = path.join(__dirname, "../cloud_config.json");
if (fs.existsSync(configPath)) {
    try {
        cloudConfig = JSON.parse(fs.readFileSync(configPath));
    } catch (e) {
        console.warn(
            "Could not parse cloud_config.json, falling back to local.",
        );
    }
}

const DEFAULT_CLOUD = { id: "cloud", x: 0, y: 0, url: "http://localhost:4000" };

const DEFAULT_EDGES = [
    {
        id: "edge-1",
        x: 100,
        y: 100,
        manager: "http://localhost:5001",
        app: "http://localhost:8001",
    }, // North-East
    {
        id: "edge-2",
        x: 100,
        y: -100,
        manager: "http://localhost:5002",
        app: "http://localhost:8002",
    }, // South-East
    {
        id: "edge-3",
        x: -100,
        y: 100,
        manager: "http://localhost:5003",
        app: "http://localhost:8003",
    }, // North-West
    {
        id: "edge-4",
        x: -100,
        y: -100,
        manager: "http://localhost:5004",
        app: "http://localhost:8004",
    }, // South-West
    {
        id: "edge-5",
        x: 0,
        y: 150,
        manager: "http://localhost:5005",
        app: "http://localhost:8005",
    }, // North
];

let CLOUD = DEFAULT_CLOUD;
let EDGES = DEFAULT_EDGES;

if (cloudConfig) {
    if (cloudConfig.central && cloudConfig.central.url) {
        CLOUD = { id: "cloud", x: 0, y: 0, url: cloudConfig.central.url };
    }
    if (cloudConfig.edges && Object.keys(cloudConfig.edges).length > 0) {
        // Map the JSON edges into the array format
        EDGES = Object.values(cloudConfig.edges).map((edge, index) => {
            // Preserve existing x,y coords if possible, or assign defaults
            const defaultCoords = DEFAULT_EDGES[index % DEFAULT_EDGES.length];
            return {
                id: edge.id || `edge-${index + 1}`,
                x: defaultCoords.x,
                y: defaultCoords.y,
                manager: edge.managerUrl,
                app: edge.appUrl,
                worker: edge.workerUrl || null,
            };
        });
    }
}

module.exports = {
    CLOUD,
    EDGES,
};
