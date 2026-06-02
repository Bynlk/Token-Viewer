import * as http from 'http';
import * as https from 'https';

// ============================================================
// Token Viewer - HTTP 请求封装（含重试机制）
// ============================================================

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000; // 1 秒
const DEFAULT_TIMEOUT = 15000;   // 15 秒

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** 判断是否为可重试的错误 */
function isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('econnrefused') ||
        msg.includes('socket hang up') ||
        msg.includes('network request failed') ||
        msg.includes('etimedout') ||
        msg.includes('enotfound');
}

/** HTTP GET 请求（含指数退避重试） */
export function httpGet(
    url: string,
    headers: Record<string, string>,
    maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<string> {
    return httpWithRetry('GET', url, headers, undefined, maxRetries);
}

/** HTTP POST 请求（含指数退避重试） */
export function httpPost(
    url: string,
    headers: Record<string, string>,
    body: string,
    maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<string> {
    return httpWithRetry('POST', url, headers, body, maxRetries);
}

/** 带重试的 HTTP 请求核心 */
async function httpWithRetry(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body: string | undefined,
    maxRetries: number
): Promise<string> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await httpRequest(method, url, headers, body);
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // 最后一次尝试失败，直接抛出
            if (attempt >= maxRetries) {
                throw lastError;
            }

            // 不可重试的错误（如 HTTP 4xx），直接抛出
            if (!isRetryableError(lastError)) {
                throw lastError;
            }

            // 指数退避：1s, 2s, 4s, ...
            const delay = DEFAULT_BASE_DELAY * Math.pow(2, attempt);
            await sleep(delay);
        }
    }

    throw lastError!;
}

/** 底层 HTTP 请求实现 */
function httpRequest(
    method: 'GET' | 'POST',
    url: string,
    headers: Record<string, string>,
    body: string | undefined
): Promise<string> {
    return new Promise((resolve, reject) => {
        const isHttps = url.startsWith('https');
        const httpModule = isHttps ? https : http;
        const urlObj = new URL(url);

        const options: http.RequestOptions = {
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method,
            headers: method === 'POST'
                ? { ...headers, 'Content-Length': Buffer.byteLength(body || '').toString() }
                : headers,
            timeout: DEFAULT_TIMEOUT,
        };

        const req = httpModule.request(options, (res) => {
            let data = '';
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(data);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}\n响应: ${data.substring(0, 500)}`));
                }
            });
        });

        req.on('error', (error: Error) => {
            reject(new Error(`网络请求失败: ${error.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('请求超时（15 秒）'));
        });

        if (method === 'POST' && body) {
            req.write(body);
        }
        req.end();
    });
}
