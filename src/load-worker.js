const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// High performance agent
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

app.post('/execute-load', async (req, res) => {
    const { targetUrl, method = 'GET', payload = {}, concurrency = 10, count = 100 } = req.body;

    console.log(`[WORKER] Starting load test on ${targetUrl}. Count: ${count}, Concurrency: ${concurrency}`);

    let results = [];
    let activePromises = [];

    const client = axios.create({
        httpAgent,
        httpsAgent,
        timeout: 15000,
        validateStatus: () => true // Resolve on all statuses
    });

    const executeRequest = async (id) => {
        const start = Date.now();
        try {
            const config = {
                method,
                url: targetUrl,
                data: method === 'POST' ? payload : undefined
            };
            const response = await client(config);
            const rtt = Date.now() - start;
            return { id, success: response.status >= 200 && response.status < 400, status: response.status, rtt };
        } catch (error) {
            const rtt = Date.now() - start;
            return { id, success: false, status: error.code || 'ERROR', rtt };
        }
    };

    for (let i = 0; i < count; i++) {
        const p = executeRequest(i).then(r => results.push(r));
        activePromises.push(p);

        if (activePromises.length >= concurrency) {
            await Promise.all(activePromises);
            activePromises = [];
        }
    }

    if (activePromises.length > 0) {
        await Promise.all(activePromises);
    }

    console.log(`[WORKER] Load test complete. ${results.length} requests processed.`);
    res.json({ results });
});

app.listen(PORT, () => {
    console.log(`--- [WORKER] Load Worker listening on port ${PORT} ---`);
});
