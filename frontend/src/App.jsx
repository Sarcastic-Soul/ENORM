import { useEffect, useRef, useState, useMemo } from "react";
import { io } from "socket.io-client";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
);

const socket = io("http://localhost:3000");

function App() {
    const [envData, setEnvData] = useState({
        cloud: null,
        edges: [],
        users: [],
    });

    const [selectedUserId, setSelectedUserId] = useState(null);
    const [viewportOffset, setViewportOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);

    const [isRoaming, setIsRoaming] = useState(false);
    const [isSpike, setIsSpike] = useState(false);
    const [isLargePayload, setIsLargePayload] = useState(false);

    const canvasRef = useRef(null);
    const mapContainerRef = useRef(null);
    const isPanning = useRef(false);
    const lastPanPos = useRef({ x: 0, y: 0 });

    // --- Socket Connection ---
    useEffect(() => {
        socket.on("init_state", (data) => {
            setEnvData({
                cloud: data.cloud,
                edges: data.edges,
                users: data.users,
            });
            setIsSpike(data.isSpike);
            setIsLargePayload(data.isLargePayload);
            setIsRoaming(false);
        });

        socket.on("sim_settings", (settings) => {
            setIsSpike(settings.isSpike);
            setIsLargePayload(settings.isLargePayload);
        });

        socket.on("update_users", (users) => {
            setEnvData((prev) => ({ ...prev, users }));
        });

        return () => {
            socket.off("init_state");
            socket.off("sim_settings");
            socket.off("update_users");
        };
    }, []);

    // --- Derived State for UI & Charts ---
    const selectedUserObj = useMemo(() => {
        return envData.users.find((u) => u.id === selectedUserId);
    }, [envData.users, selectedUserId]);

    const migrationAlert = useMemo(() => {
        if (
            !selectedUserObj ||
            !selectedUserObj.history ||
            selectedUserObj.history.length === 0
        )
            return "";
        const lastStat =
            selectedUserObj.history[selectedUserObj.history.length - 1];
        if (lastStat.is_migrating) {
            return `⚠️ MIGRATION SPIKE! (${lastStat.edge_latency.toFixed(0)}ms)`;
        }
        return "";
    }, [selectedUserObj]);

    const latencyChartData = useMemo(() => {
        const history = selectedUserObj?.history || [];
        return {
            labels: history.map((s) => new Date(s.time).toLocaleTimeString()),
            datasets: [
                {
                    label: "Cloud Latency (ms)",
                    data: history.map((s) => s.cloud_latency),
                    borderColor: "#bd93f9",
                    backgroundColor: "rgba(189, 147, 249, 0.2)",
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: "Edge Latency (ms)",
                    data: history.map((s) => s.edge_latency),
                    borderColor: "#50fa7b",
                    backgroundColor: "rgba(80, 250, 123, 0.2)",
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: history.map((s) =>
                        s.is_migrating ? "#ff5555" : "#50fa7b",
                    ),
                },
            ],
        };
    }, [selectedUserObj]);

    const energyChartData = useMemo(() => {
        const history = selectedUserObj?.history || [];
        return {
            labels: history.map((s) => new Date(s.time).toLocaleTimeString()),
            datasets: [
                {
                    label: "Cloud Energy (Joules)",
                    data: history.map((s) => s.cloud_energy),
                    borderColor: "#ffb86c",
                    backgroundColor: "rgba(255, 184, 108, 0.2)",
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                },
                {
                    label: "Edge Energy (Joules)",
                    data: history.map((s) => s.edge_energy),
                    borderColor: "#8be9fd",
                    backgroundColor: "rgba(139, 233, 253, 0.2)",
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 3,
                    pointBackgroundColor: history.map((s) =>
                        s.is_migrating ? "#ff5555" : "#8be9fd",
                    ),
                },
            ],
        };
    }, [selectedUserObj]);

    const chartOptions = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { display: false },
                y: {
                    beginAtZero: true,
                    grid: { color: "#44475a" },
                    ticks: { color: "#f8f8f2" },
                },
            },
            plugins: {
                legend: { labels: { color: "#f8f8f2" } },
            },
            animation: { duration: 0 },
        }),
        [],
    );

    // --- Coordinate Mapping ---
    const WORLD_SCALE = 3 * zoom;

    const getCanvasCoords = (x, y, width, height) => {
        const cx = width / 2 + viewportOffset.x + x * WORLD_SCALE;
        const cy = height / 2 + viewportOffset.y - y * WORLD_SCALE;
        return { cx, cy };
    };

    const getSimCoords = (cx, cy, width, height) => {
        const x = (cx - width / 2 - viewportOffset.x) / WORLD_SCALE;
        const y = -(cy - height / 2 - viewportOffset.y) / WORLD_SCALE;
        return { x, y };
    };

    // --- Canvas Interactions ---
    const handleMouseDown = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Middle click = Pan
        if (e.button === 1) {
            isPanning.current = true;
            lastPanPos.current = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = "grabbing";
            e.preventDefault();
            return;
        }

        // Left click = Move selected user
        if (e.button === 0) {
            if (selectedUserId) {
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;

                const simCoord = getSimCoords(
                    cx,
                    cy,
                    canvas.width,
                    canvas.height,
                );
                const user = envData.users.find((u) => u.id === selectedUserId);
                if (user) {
                    socket.emit("move_user", {
                        id: selectedUserId,
                        dx: simCoord.x - user.x,
                        dy: simCoord.y - user.y,
                    });
                }
            }
        }
    };

    const handleMouseMove = (e) => {
        if (!isPanning.current) return;
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;

        setViewportOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastPanPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = (e) => {
        if (e.button === 1) {
            isPanning.current = false;
            if (canvasRef.current) canvasRef.current.style.cursor = "crosshair";
        }
    };

    const handleWheel = (e) => {
        setZoom((prev) => {
            const newZoom = prev - e.deltaY * 0.001;
            return Math.max(0.2, Math.min(newZoom, 5));
        });
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const preventDefault = (e) => e.button === 1 && e.preventDefault();
        canvas.addEventListener("mousedown", preventDefault);
        return () => canvas.removeEventListener("mousedown", preventDefault);
    }, []);

    // --- Canvas Rendering Loop ---
    useEffect(() => {
        const canvas = canvasRef.current;
        const container = mapContainerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext("2d");

        const resize = () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        };

        const drawMap = (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);

            // Draw Grid
            ctx.strokeStyle = "#282a36";
            ctx.lineWidth = 1;
            const gridSize = 50 * WORLD_SCALE;

            let offsetX = (viewportOffset.x + w / 2) % gridSize;
            let offsetY = (viewportOffset.y + h / 2) % gridSize;
            if (offsetX < 0) offsetX += gridSize;
            if (offsetY < 0) offsetY += gridSize;

            for (let x = offsetX; x < w; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            for (let y = offsetY; y < h; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Draw Cloud
            if (envData.cloud) {
                const pos = getCanvasCoords(
                    envData.cloud.x,
                    envData.cloud.y,
                    w,
                    h,
                );
                ctx.fillStyle = "#8be9fd";
                ctx.beginPath();
                ctx.arc(
                    pos.cx,
                    pos.cy,
                    35 * Math.min(zoom, 1.5),
                    0,
                    Math.PI * 2,
                );
                ctx.fill();
                ctx.fillStyle = "#282a36";
                ctx.textAlign = "center";
                ctx.font = `bold ${Math.max(10, 14 * zoom)}px Arial`;
                ctx.fillText("CLOUD", pos.cx, pos.cy + 5 * zoom);
            }

            // Draw Edges
            envData.edges.forEach((edge) => {
                const pos = getCanvasCoords(edge.x, edge.y, w, h);
                const edgeSize = 50 * Math.min(zoom, 1.5);
                ctx.fillStyle = "#ffb86c";
                ctx.fillRect(
                    pos.cx - edgeSize / 2,
                    pos.cy - edgeSize / 2,
                    edgeSize,
                    edgeSize,
                );
                ctx.fillStyle = "#282a36";
                ctx.font = `bold ${Math.max(8, 12 * zoom)}px Arial`;
                ctx.fillText(edge.id, pos.cx, pos.cy + 4 * zoom);

                // Range Ring
                ctx.strokeStyle = "rgba(255, 184, 108, 0.2)";
                ctx.beginPath();
                ctx.arc(pos.cx, pos.cy, 100 * WORLD_SCALE, 0, Math.PI * 2);
                ctx.stroke();
            });

            // Draw Users
            envData.users.forEach((user) => {
                const pos = getCanvasCoords(user.x, user.y, w, h);
                const isSelected = user.id === selectedUserId;

                // Connection line
                if (
                    user.currentEdgeIdx !== undefined &&
                    envData.edges[user.currentEdgeIdx]
                ) {
                    const edgePos = getCanvasCoords(
                        envData.edges[user.currentEdgeIdx].x,
                        envData.edges[user.currentEdgeIdx].y,
                        w,
                        h,
                    );
                    ctx.strokeStyle = isSelected
                        ? "#50fa7b"
                        : "rgba(80, 250, 123, 0.2)";
                    ctx.lineWidth = isSelected ? 2 : 1;
                    ctx.beginPath();
                    ctx.moveTo(pos.cx, pos.cy);
                    ctx.lineTo(edgePos.cx, edgePos.cy);
                    ctx.stroke();
                }

                // Dot
                const dotSize = (isSelected ? 10 : 6) * Math.min(zoom, 2);
                ctx.fillStyle = isSelected ? "#ff79c6" : "#f8f8f2";
                ctx.beginPath();
                ctx.arc(pos.cx, pos.cy, dotSize, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = "#282a36";
                ctx.lineWidth = 2;
                ctx.stroke();

                // Label
                ctx.fillStyle = "#6272a4";
                ctx.font = `${Math.max(10, 12 * zoom)}px Arial`;
                ctx.fillText(user.id, pos.cx, pos.cy - 15 * zoom);
            });
        };

        resize();
        window.addEventListener("resize", resize);

        let animationId;
        const renderLoop = () => {
            if (canvasRef.current)
                drawMap(ctx, canvasRef.current.width, canvasRef.current.height);
            animationId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        return () => {
            window.removeEventListener("resize", resize);
            cancelAnimationFrame(animationId);
        };
    }, [envData, selectedUserId, viewportOffset, zoom]);

    // --- Button Actions ---
    const spawnUsers = (count) => socket.emit("spawn_users", count);

    const resetSim = () => {
        socket.emit("reset");
        setSelectedUserId(null);
        setViewportOffset({ x: 0, y: 0 });
        setZoom(1);
    };

    const toggleRoam = () => {
        setIsRoaming(!isRoaming);
        socket.emit("toggle_roam", !isRoaming);
    };
    const toggleSpike = () => socket.emit("toggle_spike", !isSpike);
    const togglePayload = () => socket.emit("toggle_payload", !isLargePayload);

    return (
        <div className="app-container">
            <header>
                <h1>ENORM Simulation Dashboard</h1>
                <div className="controls">
                    <button onClick={() => spawnUsers(1)}>+1 User</button>
                    <button onClick={() => spawnUsers(5)}>+5 Users</button>
                    <button
                        className={isRoaming ? "warning" : ""}
                        onClick={toggleRoam}
                    >
                        {isRoaming ? "Stop Roaming" : "Auto-Roam"}
                    </button>
                    <button
                        className={isSpike ? "danger" : ""}
                        onClick={toggleSpike}
                    >
                        {isSpike ? "Disable Jitter" : "Simulate Congestion"}
                    </button>
                    <button
                        className={isLargePayload ? "danger" : ""}
                        onClick={togglePayload}
                    >
                        {isLargePayload
                            ? "Disable Heavy Load"
                            : "Simulate Large Payload"}
                    </button>
                    <button className="danger" onClick={resetSim}>
                        Reset
                    </button>
                </div>
            </header>

            <div
                className="main-content"
                style={{
                    display: "grid",
                    gridTemplateColumns: "300px 1fr",
                    padding: "20px",
                    gap: "20px",
                    flex: 1,
                    overflow: "hidden",
                    minHeight: 0,
                }}
            >
                {/* Left Panel: Users Table */}
                <div
                    className="panel user-sidebar"
                    style={{
                        overflowY: "auto",
                        backgroundColor: "#282a36",
                        padding: "20px",
                        borderRadius: "8px",
                    }}
                >
                    <h3
                        style={{
                            marginTop: 0,
                            color: "#8be9fd",
                            textAlign: "center",
                        }}
                    >
                        Users list
                    </h3>
                    <table
                        style={{
                            width: "100%",
                            textAlign: "left",
                            borderCollapse: "collapse",
                        }}
                    >
                        <thead>
                            <tr>
                                <th
                                    style={{
                                        borderBottom: "2px solid #44475a",
                                        padding: "8px",
                                    }}
                                >
                                    ID
                                </th>
                                <th
                                    style={{
                                        borderBottom: "2px solid #44475a",
                                        padding: "8px",
                                    }}
                                >
                                    X
                                </th>
                                <th
                                    style={{
                                        borderBottom: "2px solid #44475a",
                                        padding: "8px",
                                    }}
                                >
                                    Y
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {envData.users.map((u) => (
                                <tr
                                    key={u.id}
                                    onClick={() => setSelectedUserId(u.id)}
                                    style={{
                                        cursor: "pointer",
                                        backgroundColor:
                                            selectedUserId === u.id
                                                ? "#44475a"
                                                : "transparent",
                                        borderBottom: "1px solid #44475a",
                                    }}
                                >
                                    <td
                                        style={{
                                            padding: "8px",
                                            color:
                                                selectedUserId === u.id
                                                    ? "#50fa7b"
                                                    : "#f8f8f2",
                                        }}
                                    >
                                        {u.id}
                                    </td>
                                    <td style={{ padding: "8px" }}>
                                        {u.x.toFixed(0)}
                                    </td>
                                    <td style={{ padding: "8px" }}>
                                        {u.y.toFixed(0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Right Area: Map and Charts */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateRows: "1fr 280px",
                        gap: "20px",
                        overflow: "hidden",
                        minHeight: 0,
                    }}
                >
                    {/* Top: Infinite Canvas Map */}
                    <div
                        className="panel map-panel"
                        style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "hidden",
                            minHeight: 0,
                        }}
                    >
                        <div className="selected-info">
                            {selectedUserObj
                                ? `Tracking ${selectedUserObj.id} | Pos: (${selectedUserObj.x.toFixed(0)}, ${selectedUserObj.y.toFixed(0)}) | Connected: ${envData.edges[selectedUserObj.currentEdgeIdx]?.id || "Unknown"}`
                                : "Select a user from the table to begin tracking and moving them."}
                        </div>

                        <div
                            className="canvas-wrapper"
                            ref={mapContainerRef}
                            style={{
                                flex: 1,
                                position: "relative",
                                overflow: "hidden",
                            }}
                        >
                            <canvas
                                ref={canvasRef}
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                onWheel={handleWheel}
                            ></canvas>
                        </div>

                        <div className="instructions">
                            Controls: Select user from left table. Left click on
                            map to move them. Middle Click drag to pan. Scroll
                            Wheel to zoom.
                        </div>
                    </div>

                    {/* Bottom: Charts */}
                    <div
                        className="panel chart-panel"
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "20px",
                            overflow: "hidden",
                            minHeight: 0,
                        }}
                    >
                        <div
                            className="chart-container"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                overflow: "hidden",
                                minHeight: 0,
                            }}
                        >
                            <h3
                                style={{
                                    margin: 0,
                                    textAlign: "center",
                                    color: "#ff79c6",
                                }}
                            >
                                Network Latency
                            </h3>
                            <div
                                style={{
                                    flex: 1,
                                    position: "relative",
                                    minHeight: 0,
                                }}
                            >
                                {selectedUserObj ? (
                                    <Line
                                        options={chartOptions}
                                        data={latencyChartData}
                                    />
                                ) : (
                                    <p
                                        style={{
                                            textAlign: "center",
                                            color: "#6272a4",
                                            marginTop: "50px",
                                        }}
                                    >
                                        No user selected
                                    </p>
                                )}
                            </div>
                        </div>

                        <div
                            className="chart-container"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                overflow: "hidden",
                                minHeight: 0,
                            }}
                        >
                            <h3
                                style={{
                                    margin: 0,
                                    textAlign: "center",
                                    color: "#8be9fd",
                                }}
                            >
                                Energy Consumption
                            </h3>
                            <div
                                style={{
                                    flex: 1,
                                    position: "relative",
                                    minHeight: 0,
                                }}
                            >
                                {selectedUserObj ? (
                                    <Line
                                        options={chartOptions}
                                        data={energyChartData}
                                    />
                                ) : (
                                    <p
                                        style={{
                                            textAlign: "center",
                                            color: "#6272a4",
                                            marginTop: "50px",
                                        }}
                                    >
                                        No user selected
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
