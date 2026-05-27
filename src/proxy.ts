import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as net from 'net';
import * as tls from 'tls';
import * as os from 'os';
import { execSync } from 'child_process';
import { AppState, CertAndKey, CaMaterial } from './types';
import { bypassSystemProxy, getProxyPort } from './utils';
import { generateCaCert, generateDomainCert, pemToDer } from './certs';
import { openBrowserWithProxy } from './browser';
import { fetchTokenCount } from './api';

// ============================================================
// Token Viewer - MITM 代理服务器
// ============================================================

export function startProxy(app: AppState, context: vscode.ExtensionContext): void {
    if (app.proxyServer) {
        vscode.window.showInformationMessage('代理已在运行中');
        return;
    }

    const port = getProxyPort();

    // 生成或加载 CA 证书
    const storageUri = context.globalStorageUri;
    const caCertPath = path.join(storageUri.fsPath, 'ca-cert.pem');
    const caKeyPath = path.join(storageUri.fsPath, 'ca-key.pem');

    if (fs.existsSync(caCertPath) && fs.existsSync(caKeyPath)) {
        app.outputChannel.appendLine('[Token Viewer] 加载已有的 CA 证书');
        const certPem = fs.readFileSync(caCertPath, 'utf8');
        const keyPem = fs.readFileSync(caKeyPath, 'utf8');
        const certDer = pemToDer(certPem);
        const tempCa = generateCaCert();
        app.caMaterialGlobal = { certPem, keyPem, certDer, subjectDer: tempCa.subjectDer };
    } else {
        app.outputChannel.appendLine('[Token Viewer] 生成新的 CA 证书');
        app.caMaterialGlobal = generateCaCert();
        try {
            fs.mkdirSync(storageUri.fsPath, { recursive: true });
            fs.writeFileSync(caCertPath, app.caMaterialGlobal.certPem);
            fs.writeFileSync(caKeyPath, app.caMaterialGlobal.keyPem);
        } catch (e) {
            app.outputChannel.appendLine(`[Token Viewer] 保存 CA 证书失败: ${e}`);
        }
    }

    // 安装 CA 到信任根
    const caInstalled = context.globalState.get<boolean>('tokenViewer.caInstalled');
    if (!caInstalled && !isCaInstalledInTrustStore()) {
        installCaCertToTrustStore(app.caMaterialGlobal.certDer).then((success) => {
            if (success) {
                context.globalState.update('tokenViewer.caInstalled', true);
                app.outputChannel.appendLine('[Token Viewer] CA 证书已安装到信任根存储');
            } else {
                vscode.window.showWarningMessage(
                    'CA 证书安装失败（UAC 被拒绝？）。代理仍可运行，但浏览器会显示证书警告。',
                    '重试安装'
                ).then((action) => {
                    if (action === '重试安装') {
                        installCaCertToTrustStore(app.caMaterialGlobal!.certDer).then((s) => {
                            if (s) { context.globalState.update('tokenViewer.caInstalled', true); }
                        });
                    }
                });
            }
        });
    }

    // 创建 HTTP 服务器
    const server = http.createServer();

    server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
        try {
            const host = req.headers.host || '';
            if (host.includes('platform.xiaomimimo.com') && req.headers.cookie) {
                onCookieCaptured(app, req.headers.cookie, context);
            }
            const urlObj = new URL(req.url || '/', `http://${host}`);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 80,
                path: urlObj.pathname + urlObj.search,
                method: req.method,
                headers: req.headers,
                agent: false as const,
                timeout: 30000,
            };
            const proxyReq = bypassSystemProxy(() => http.request(options, (proxyRes: http.IncomingMessage) => {
                res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
                proxyRes.pipe(res);
            }));
            proxyReq.on('error', () => { try { res.writeHead(502); res.end(); } catch { /* ignore */ } });
            proxyReq.on('timeout', () => { proxyReq.destroy(); try { res.writeHead(504); res.end(); } catch { /* ignore */ } });
            req.pipe(proxyReq);
        } catch (err) {
            app.outputChannel.appendLine(`[Token Viewer] 请求处理错误: ${err instanceof Error ? err.message : String(err)}`);
            try { res.writeHead(400); res.end(); } catch { /* ignore */ }
        }
    });

    server.on('connect', (req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) => {
        const url = req.url || '';
        const colonIdx = url.lastIndexOf(':');
        const targetHost = colonIdx > 0 ? url.substring(0, colonIdx) : url;
        const targetPort = colonIdx > 0 ? parseInt(url.substring(colonIdx + 1), 10) || 443 : 443;

        if (!targetHost) {
            try { clientSocket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { /* ignore */ }
            return;
        }

        if (targetHost === 'platform.xiaomimimo.com') {
            handleConnectIntercept(app, clientSocket, targetHost, targetPort, head, context);
        } else {
            tunnelDirect(app, clientSocket, targetHost, targetPort, head);
        }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            vscode.window.showErrorMessage(`代理端口 ${port} 被占用，请修改 tokenViewer.proxyPort 设置`);
        } else {
            app.outputChannel.appendLine(`[Token Viewer] 代理错误: ${err.message}`);
        }
        app.proxyServer = undefined;
        updateProxyStatusBar(app);
    });

    server.listen(port, '127.0.0.1', () => {
        app.proxyServer = server;
        updateProxyStatusBar(app);
        app.outputChannel.appendLine(`[Token Viewer] 代理已启动: http://127.0.0.1:${port}`);
        vscode.window.showInformationMessage(
            `代理已启动 :${port}，正在打开浏览器...`,
            '确定'
        );
        openBrowserWithProxy(app, port);
    });
}

export function stopProxy(app: AppState): void {
    for (const sock of app.activeProxySockets) {
        try { sock.destroy(); } catch { /* ignore */ }
    }
    app.activeProxySockets.clear();
    app.domainCertCache.clear();

    if (app.proxyServer) {
        app.proxyServer.close();
        app.proxyServer = undefined;
    }
    updateProxyStatusBar(app);
    app.outputChannel.appendLine('[Token Viewer] 代理已停止');
}

function tunnelDirect(app: AppState, clientSocket: net.Socket, host: string, port: number, head: Buffer): void {
    const serverSocket = bypassSystemProxy(() => net.connect(port, host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) { serverSocket.write(head); }
        serverSocket.pipe(clientSocket);
        clientSocket.pipe(serverSocket);
    }));
    serverSocket.on('error', () => { try { clientSocket.destroy(); } catch { /* ignore */ } });
    clientSocket.on('error', () => { try { serverSocket.destroy(); } catch { /* ignore */ } });
    clientSocket.on('close', () => { try { serverSocket.destroy(); } catch { /* ignore */ } });
}

function handleConnectIntercept(
    app: AppState,
    clientSocket: net.Socket,
    host: string, port: number, head: Buffer,
    context: vscode.ExtensionContext
): void {
    const ca = app.caMaterialGlobal;
    if (!ca) { tunnelDirect(app, clientSocket, host, port, head); return; }

    let domainCert = app.domainCertCache.get(host);
    if (!domainCert) {
        domainCert = generateDomainCert(host, ca);
        app.domainCertCache.set(host, domainCert);
    }

    let serverSocket: net.Socket | undefined;

    const cleanup = () => {
        try { clientSocket.destroy(); } catch { /* ignore */ }
        if (serverSocket) { try { serverSocket.destroy(); } catch { /* ignore */ } }
        app.activeProxySockets.delete(clientSocket);
        if (serverSocket) { app.activeProxySockets.delete(serverSocket); }
    };

    app.activeProxySockets.add(clientSocket);

    serverSocket = bypassSystemProxy(() => net.connect(port, host, () => {
        app.activeProxySockets.add(serverSocket!);

        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

        const secureContext = tls.createSecureContext({
            key: domainCert!.keyPem,
            cert: domainCert!.certPem,
        });

        const tlsSocket = new tls.TLSSocket(clientSocket, {
            isServer: true,
            secureContext,
        });

        tlsSocket.on('error', (err: Error) => {
            app.outputChannel.appendLine(`[Token Viewer] TLS 错误 (${host}): ${err.message}`);
            cleanup();
        });

        let headerParsed = false;
        let requestBuffer = Buffer.alloc(0);

        tlsSocket.on('data', (data: Buffer) => {
            if (headerParsed) {
                serverSocket!.write(data);
                return;
            }

            requestBuffer = Buffer.concat([requestBuffer, data]);
            const headerEnd = requestBuffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) { return; }

            headerParsed = true;
            const headerPart = requestBuffer.slice(0, headerEnd).toString('utf8');
            const bodyPart = requestBuffer.slice(headerEnd + 4);

            const lines = headerPart.split('\r\n');
            const [method, reqPath, httpVersion] = lines[0].split(' ');
            const headers: Record<string, string> = {};
            for (let i = 1; i < lines.length; i++) {
                const colonIdx = lines[i].indexOf(':');
                if (colonIdx > 0) {
                    headers[lines[i].slice(0, colonIdx).trim().toLowerCase()] = lines[i].slice(colonIdx + 1).trim();
                }
            }

            if (headers['cookie']) {
                onCookieCaptured(app, headers['cookie'], context);
            }

            const fwdHeaders: Record<string, string> = { ...headers };
            delete fwdHeaders['proxy-connection'];
            fwdHeaders['host'] = host;

            let fwdRequest = `${method} ${reqPath} ${httpVersion}\r\n`;
            for (const [k, v] of Object.entries(fwdHeaders)) {
                fwdRequest += `${k}: ${v}\r\n`;
            }
            fwdRequest += '\r\n';

            serverSocket!.write(fwdRequest);
            if (bodyPart.length > 0) {
                serverSocket!.write(bodyPart);
            }

            tlsSocket.pipe(serverSocket!);
            serverSocket!.pipe(tlsSocket);
        });

        serverSocket!.on('error', (err: Error) => {
            app.outputChannel.appendLine(`[Token Viewer] 上游错误 (${host}): ${err.message}`);
            cleanup();
        });

        serverSocket!.on('close', cleanup);
        tlsSocket.on('close', cleanup);
    }));

    serverSocket.on('error', (err: Error) => {
        app.outputChannel.appendLine(`[Token Viewer] 连接 ${host}:${port} 失败: ${err.message}`);
        try {
            clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        } catch { /* ignore */ }
        cleanup();
    });
}

function onCookieCaptured(app: AppState, cookieValue: string, context: vscode.ExtensionContext): void {
    const config = vscode.workspace.getConfiguration('tokenViewer');
    const currentHeaders = config.get<Record<string, string>>('headers', {});
    if (currentHeaders['Cookie'] === cookieValue) { return; }

    config.update('headers', { Cookie: cookieValue }, vscode.ConfigurationTarget.Global).then(() => {
        app.outputChannel.appendLine('[Token Viewer] Cookie 已自动捕获');
        fetchTokenCount(app, context);
    });
}

export function updateProxyStatusBar(app: AppState): void {
    if (!app.proxyStatusBarItem) { return; }
    if (app.proxyServer) {
        app.proxyStatusBarItem.text = `$(radio-tower) Proxy: :${getProxyPort()}`;
        app.proxyStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        app.proxyStatusBarItem.command = 'tokenViewer.proxyStop';
        app.proxyStatusBarItem.tooltip = '代理运行中 - 点击停止';
    } else {
        app.proxyStatusBarItem.text = '$(circle-slash) Proxy: Off';
        app.proxyStatusBarItem.backgroundColor = undefined;
        app.proxyStatusBarItem.command = 'tokenViewer.proxyStart';
        app.proxyStatusBarItem.tooltip = '代理已停止 - 点击启动';
    }
}

// ============================================================
// CA 证书安装到 Windows 信任根存储
// ============================================================

async function installCaCertToTrustStore(certDer: Buffer): Promise<boolean> {
    const tmpFile = path.join(os.tmpdir(), 'token-viewer-ca.der');
    fs.writeFileSync(tmpFile, certDer);

    try {
        const psScript = `
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${tmpFile.replace(/\\/g, '\\\\')}')
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
$store.Open('ReadWrite')
$store.Add($cert)
$store.Close()
Write-Output 'OK'
`;
        execSync(`powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"')}"`, {
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return true;
    } catch {
        return false;
    } finally {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

function isCaInstalledInTrustStore(): boolean {
    try {
        const output = execSync('certutil -verifystore "Root" "Token Viewer Local CA"', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        return output.includes('Token Viewer Local CA');
    } catch {
        return false;
    }
}
