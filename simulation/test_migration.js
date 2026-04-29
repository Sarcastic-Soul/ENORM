const axios = require('axios');

async function testHandoff() {
  console.log("=== Testing Phase 1: Stateful Game & Inter-Node Migration ===");

  const edge1_manager = "http://localhost:5001";
  const edge1_app = "http://localhost:8001";

  const edge2_manager = "http://localhost:5002";
  const edge2_app = "http://localhost:8002";

  try {
    // 1. Deploy Game on Edge Node 1
    console.log("\n[1] Deploying Game to Edge Node 1...");
    await axios.post(`${edge1_manager}/deploy`);
    console.log("Deployed successfully.");

    // 2. Simulate users playing the game on Edge Node 1
    console.log("\n[2] Users joining game on Edge 1...");
    await axios.post(`${edge1_app}/game/join`, { player_id: "userA", x: 10, y: 10 });
    await axios.post(`${edge1_app}/game/join`, { player_id: "userB", x: 20, y: 30 });

    console.log("User A moves...");
    await axios.post(`${edge1_app}/game/action`, { player_id: "userA", action: "move", payload: { dx: 5, dy: 5 } });
    await axios.post(`${edge1_app}/game/action`, { player_id: "userA", action: "score", payload: { points: 50 } });

    // Check State on Edge 1
    let stateRes = await axios.get(`${edge1_app}/state`);
    console.log("Edge 1 State Summary:", stateRes.data.game_state_summary);

    // 3. User Roams -> MIGRATION TRIGGERED
    console.log("\n[3] User Roaming Detected. Migrating from Edge 1 to Edge 2...");

    // Extract State from Edge 1 & Terminate
    console.log("Extracting state from Edge 1...");
    const migrateOutRes = await axios.post(`${edge1_manager}/migrate-out`);
    const exportedState = migrateOutRes.data.state;
    console.log(`Exported State Size: ${JSON.stringify(exportedState).length} bytes`);

    // Inject State into Edge 2 & Start Game
    console.log("Injecting state into Edge 2...");
    await axios.post(`${edge2_manager}/migrate-in`, { state: exportedState });

    // 4. Verify Game Continued on Edge 2
    console.log("\n[4] Verifying Game Continued on Edge Node 2...");
    stateRes = await axios.get(`${edge2_app}/state`);
    console.log("Edge 2 State Summary:", stateRes.data.game_state_summary);

    // User A can keep playing without losing score
    console.log("User A moves on Edge 2...");
    const actionRes = await axios.post(`${edge2_app}/game/action`, { player_id: "userA", action: "move", payload: { dx: 2, dy: 0 } });
    console.log("User A Final State:", actionRes.data.player);

    // Cleanup
    await axios.post(`${edge2_manager}/terminate`);
    console.log("\n=== Test Completed Successfully! ===");

  } catch (error) {
    console.error("Test failed:", error.response ? error.response.data : error.message);
  }
}

testHandoff();
