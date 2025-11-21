
import tls from "node:tls";
import net from "node:net";
import { CertificateManager } from "../apps/client/electron/main/preview-proxy-certs";

async function run() {
    console.log("Starting cert debug...");
    const certManager = new CertificateManager();
    const hostname = "cmux-test-base-8080.cmux.local";
    
    console.log("Generating certs...");
    const { key, cert } = certManager.getCertDataForHost(hostname);
    
    console.log("Key length:", key.length);
    console.log("Cert length:", cert.length);
    
    const server = tls.createServer({
        key,
        cert,
    }, (socket) => {
        console.log("Server: connection received");
        socket.write("Hello from server");
        socket.pipe(socket);
    });
    
    // We want to test if wrapping in PassThrough breaks certs.
    // But tls.createServer handles the socket immediately.
    // We can't easily wrap it *before* TLS handshake if we use tls.createServer listening on port.
    // Because tls.createServer wraps the net.Socket immediately.
    
    // So we should use net.createServer and upgrade manually, like in debug-manual-tls.ts.
    // But debug-manual-tls.ts failed.
    
    // Let's try to use net.createServer in debug-cert-gen.ts and see if we can reproduce the success of debug-cert-gen.ts using manual upgrade?
    // No, debug-cert-gen.ts success was due to tls.createServer listening.
    
    // If I want to test PassThrough, I should use net.createServer, wrap socket in PT, and then use tls.Server.emit.
    // This is exactly what debug-manual-tls.ts does.
    
    // So debug-manual-tls.ts IS the test case.
    
    // Why does debug-manual-tls.ts fail?
    // Maybe because PT doesn't have `server` property or something?
    
    // Let's try to assign properties to PT.
    
    server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'string' ? 0 : address?.port;
        console.log(`Server listening on port ${port}`);
        // Connect client via net.connect then upgrade
        const socket = net.connect(port || 0, '127.0.0.1', () => {
            console.log("Client: net connected");
            const client = tls.connect({
                socket,
                rejectUnauthorized: false,
                servername: 'cmux-test-base-8080.cmux.local',
                checkServerIdentity: (host, cert) => {
                    console.log("Client: checkServerIdentity called");
                    console.log("Client: cert subject:", cert.subject);
                    return undefined;
                }
            });
            
            client.on("secureConnect", () => {
                console.log("Client: secure connected");
                const cert = client.getPeerCertificate();
                console.log("Client: peer cert subject:", cert.subject);
                client.end();
                server.close();
            });
            
            client.on("error", (err) => {
                console.error("Client error:", err);
                server.close();
            });
        });
    });
}

run().catch(console.error);
