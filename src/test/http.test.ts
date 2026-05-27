import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'http';
import { httpGet, httpPost } from '../http';

describe('http', () => {
    // Helper to create a local test server
    function createTestServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; port: number }> {
        return new Promise((resolve) => {
            const server = http.createServer(handler);
            server.listen(0, '127.0.0.1', () => {
                const port = (server.address() as any).port;
                resolve({ server, port });
            });
        });
    }

    it('httpGet returns response body on success', async () => {
        const { server, port } = await createTestServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        });

        try {
            const body = await httpGet(`http://127.0.0.1:${port}/test`, {});
            const json = JSON.parse(body);
            assert.equal(json.ok, true);
        } finally {
            server.close();
        }
    });

    it('httpGet rejects on non-2xx status', async () => {
        const { server, port } = await createTestServer((req, res) => {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('not found');
        });

        try {
            await assert.rejects(
                () => httpGet(`http://127.0.0.1:${port}/missing`, {}),
                (err: Error) => {
                    assert.ok(err.message.includes('HTTP 404'));
                    return true;
                }
            );
        } finally {
            server.close();
        }
    });

    it('httpPost sends body and returns response', async () => {
        let receivedBody = '';
        const { server, port } = await createTestServer((req, res) => {
            let data = '';
            req.on('data', (chunk) => { data += chunk; });
            req.on('end', () => {
                receivedBody = data;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ received: true }));
            });
        });

        try {
            const body = await httpPost(`http://127.0.0.1:${port}/api`, {}, '{"test":123}');
            const json = JSON.parse(body);
            assert.equal(json.received, true);
            assert.equal(receivedBody, '{"test":123}');
        } finally {
            server.close();
        }
    });

    it('httpGet rejects on timeout', async () => {
        const { server, port } = await createTestServer((req, res) => {
            // Never respond - trigger timeout
        });

        try {
            await assert.rejects(
                () => httpGet(`http://127.0.0.1:${port}/slow`, {}),
                (err: Error) => {
                    assert.ok(err.message.includes('超时') || err.message.includes('timeout'));
                    return true;
                }
            );
        } finally {
            server.close();
        }
    });
});
