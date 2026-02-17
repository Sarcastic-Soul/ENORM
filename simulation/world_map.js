// world_map.js
module.exports = {
  // The Main Cloud Server (Far away from edge clusters)
  CLOUD: { id: "cloud", x: 0, y: 0, url: "http://localhost:4000" },

  // Edge Nodes (Scattered around the "World")
  EDGES: [
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
  ],
};
